import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  evaluarLicenciaInstitucional,
  limiteEntregaInstitucional,
  limiteOfflineInstitucional,
} from './licencia-institucional.policy';

type Tx = Prisma.TransactionClient;

/** Entitlement reads only. No user, score, streak or exported PDF is deleted. */
@Injectable()
export class LicenciaAccesoService {
  constructor(private readonly prisma: PrismaService) {}

  private async contexto(tx: Tx, usuarioId: string, ahora: Date) {
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      include: {
        origenGestionadoLicencia: true,
        membresiaInstitucion: true,
        asignacionesLicencia: { where: { estado: 'ACTIVA' } },
      },
    });
    if (!usuario || usuario.suprimidaEn || usuario.rol === null)
      throw new UnauthorizedException('La cuenta ya no está disponible.');
    if (usuario.rol === 'ADMIN') return null;
    const institucionId =
      usuario.origenGestionadoLicencia?.institucionId ??
      usuario.institucionId ??
      usuario.membresiaInstitucion?.institucionId ??
      usuario.asignacionesLicencia[0]?.institucionId;
    if (!institucionId) return null;
    const control = await tx.controlLicenciaInstitucional.findUnique({
      where: { institucionId },
    });
    if (!control) return null;
    const propietario =
      usuario.membresiaInstitucion?.institucionId === institucionId &&
      usuario.membresiaInstitucion.rol === 'PROPIETARIO';
    const asignacion = usuario.asignacionesLicencia.find(
      (a) => a.institucionId === institucionId,
    );
    const vinculado =
      propietario ||
      Boolean(
        asignacion &&
        usuario.institucionId === institucionId &&
        (asignacion.tipo === 'ESTUDIANTE'
          ? usuario.rol === 'ESTUDIANTE'
          : usuario.rol === 'PROFESOR' &&
            usuario.membresiaInstitucion?.institucionId === institucionId),
      );
    const actual = await tx.periodoContratoInstitucional.findFirst({
      where: { institucionId, inicio: { lte: ahora }, fin: { gt: ahora } },
    });
    const periodo =
      actual ??
      (await tx.periodoContratoInstitucional.findFirst({
        where: { institucionId },
        orderBy: { inicio: 'desc' },
      }));
    const evaluacion = control.suspendida
      ? { estado: 'SUSPENDIDA' as const, habilitaPractica: false }
      : evaluarLicenciaInstitucional(
          institucionId,
          periodo ? { ...periodo, suspendida: false } : null,
          ahora,
        );
    return {
      institucionId,
      control,
      periodo,
      asignacion,
      propietario,
      vinculado,
      gestionada: Boolean(usuario.origenGestionadoLicencia),
      ...evaluacion,
    };
  }

  private leer<T>(trabajo: (tx: Tx, ahora: Date) => Promise<T>) {
    return this.prisma.$transaction(
      async (tx) => {
        const [reloj] = await tx.$queryRaw<
          { ahora: Date }[]
        >`SELECT clock_timestamp() AS ahora`;
        return trabajo(tx, reloj.ahora);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async exigirPractica(usuarioId: string) {
    return this.leer(async (tx, ahora) => {
      const acceso = await this.contexto(tx, usuarioId, ahora);
      if (acceso && (!acceso.vinculado || !acceso.habilitaPractica))
        throw new ForbiddenException({
          code: 'LICENCIA_INSTITUCIONAL_RESTRINGIDA',
          estado: acceso.estado,
          message:
            'Puedes consultar tu historial; la institución debe habilitar tu acceso para practicar.',
        });
      return acceso;
    });
  }

  async soloHistorico(usuarioId: string): Promise<boolean> {
    return this.leer(async (tx, ahora) => {
      const acceso = await this.contexto(tx, usuarioId, ahora);
      return Boolean(acceso && (!acceso.vinculado || !acceso.habilitaPractica));
    });
  }

  async resumenPropio(usuarioId: string) {
    return this.leer(async (tx, ahora) => {
      const acceso = await this.contexto(tx, usuarioId, ahora);
      if (!acceso) return null;
      return {
        version: 1,
        institucionId: acceso.institucionId,
        estadoLicencia: acceso.estado,
        origenCuenta: acceso.gestionada ? 'GESTIONADA' : 'PERSONAL_VINCULADA',
        asignacionActiva: acceso.vinculado,
        permitePractica: acceso.vinculado && acceso.habilitaPractica,
        permiteHistorial: true,
        inicio: acceso.periodo?.inicio ?? null,
        fin: acceso.periodo?.fin ?? null,
        validadoEn: ahora,
      };
    });
  }

  async imagenIntentoVigente(
    usuarioId: string,
    archivoId: string,
  ): Promise<boolean> {
    return this.leer(async (tx, ahora) => {
      const acceso = await this.contexto(tx, usuarioId, ahora);
      if (!acceso) return false;
      if (!acceso.vinculado || acceso.control.suspendida) return false;
      const diagnostico = await tx.diagnosticoInicial.findUnique({
        where: { usuarioId },
      });
      const simulacros = await tx.intentoSimulacro.findMany({
        where: {
          usuarioId,
          consumidoEn: null,
          origen: { in: ['SIMULACRO', 'PERSONALIZADO'] },
          expira: { gt: ahora },
        },
      });
      const intentos = [
        ...(diagnostico && !diagnostico.completadoEn
          ? [
              {
                inicio: diagnostico.iniciadoEn,
                expira: null,
                preguntas: diagnostico.preguntaIds,
              },
            ]
          : []),
        ...simulacros.map((s) => ({
          inicio: s.fechaCreacion,
          expira: s.expira,
          preguntas: s.preguntaIds,
        })),
      ];
      for (const intento of intentos) {
        if (
          !acceso.propietario &&
          (!acceso.asignacion?.aceptadaEn ||
            acceso.asignacion.aceptadaEn > intento.inicio)
        )
          continue;
        const periodo = await tx.periodoContratoInstitucional.findFirst({
          where: {
            institucionId: acceso.institucionId,
            inicio: { lte: intento.inicio },
            fin: { gt: intento.inicio },
          },
        });
        if (
          !periodo ||
          ahora >=
            limiteEntregaInstitucional(
              { ...periodo, suspendida: false },
              intento.inicio,
              intento.expira,
            )
        )
          continue;
        const ids = Array.isArray(intento.preguntas)
          ? intento.preguntas.filter(
              (id): id is string => typeof id === 'string',
            )
          : [];
        if (
          ids.length &&
          (await tx.pregunta.count({
            where: {
              id: { in: ids },
              OR: [
                { archivoImagenId: archivoId },
                { respuestas: { some: { archivoImagenId: archivoId } } },
                { caso: { archivoImagenId: archivoId } },
              ],
            },
          }))
        )
          return true;
      }
      return false;
    });
  }

  async limitarOffline(usuarioId: string, validadoEn: Date, finVentana: Date) {
    return this.leer(async (tx, ahora) => {
      const acceso = await this.contexto(tx, usuarioId, ahora);
      if (!acceso) return finVentana;
      if (!acceso.vinculado || !acceso.habilitaPractica || !acceso.periodo)
        throw new ForbiddenException(
          'La licencia no permite revalidar contenido privado.',
        );
      return limiteOfflineInstitucional(
        { ...acceso.periodo, suspendida: acceso.control.suspendida },
        validadoEn,
        finVentana,
      );
    });
  }

  /** Receives only a server-loaded owned diagnostic/mock, never client dates. */
  async exigirEntrega(
    usuarioId: string,
    iniciadoEn: Date,
    expira: Date | null,
  ) {
    return this.leer((tx, ahora) =>
      this.validarEntrega(tx, usuarioId, ahora, iniciadoEn, expira),
    );
  }

  /** Serialize delivery and license revocation on the institution row.
   * The callback must perform all academic writes using this same transaction.
   */
  async confirmarIntento(
    usuarioId: string,
    fuente: 'DIAGNOSTICO' | 'SIMULACRO',
    intentoId: string,
    trabajo: (tx: Tx) => Promise<void>,
  ): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        const inicial = await this.contexto(tx, usuarioId, new Date());
        // Returning to personal mode must not revive an institutional attempt.
        // Keep the persisted origin window even after the current FK is cleared.
        if (!inicial) {
          const intento =
            fuente === 'DIAGNOSTICO'
              ? await tx.diagnosticoInicial.findFirst({
                  where: { id: intentoId, usuarioId },
                })
              : await tx.intentoSimulacro.findFirst({
                  where: { id: intentoId, usuarioId },
                });
          if (!intento)
            throw new ForbiddenException(
              'El intento no pertenece a esta cuenta.',
            );
          const inicio =
            'iniciadoEn' in intento
              ? intento.iniciadoEn
              : intento.fechaCreacion;
          await this.exigirNoRetirado(tx, usuarioId, inicio);
        }
        let entrega: { inicio: Date; expira: Date | null } | null = null;
        if (inicial) {
          await tx.$queryRaw`SELECT id FROM "Institucion" WHERE id = ${inicial.institucionId}::uuid FOR SHARE`;
          const [clock] = await tx.$queryRaw<
            { ahora: Date }[]
          >`SELECT clock_timestamp() AS ahora`;
          if (fuente === 'DIAGNOSTICO') {
            const intento = await tx.diagnosticoInicial.findFirst({
              where: { id: intentoId, usuarioId },
            });
            if (!intento)
              throw new ForbiddenException(
                'El intento no pertenece a esta cuenta.',
              );
            if (intento.completadoEn) return;
            entrega = { inicio: intento.iniciadoEn, expira: null };
            await this.validarEntrega(
              tx,
              usuarioId,
              clock.ahora,
              intento.iniciadoEn,
              null,
            );
          } else {
            const intento = await tx.intentoSimulacro.findFirst({
              where: { id: intentoId, usuarioId },
            });
            if (!intento)
              throw new ForbiddenException(
                'El intento no pertenece a esta cuenta.',
              );
            if (['SIMULACRO', 'PERSONALIZADO'].includes(intento.origen)) {
              entrega = {
                inicio: intento.fechaCreacion,
                expira: intento.expira,
              };
              await this.validarEntrega(
                tx,
                usuarioId,
                clock.ahora,
                intento.fechaCreacion,
                intento.expira,
              );
            } else {
              const acceso = await this.contexto(tx, usuarioId, clock.ahora);
              if (!acceso?.vinculado || !acceso.habilitaPractica)
                throw new ForbiddenException('Se requiere licencia activa.');
            }
          }
        }
        await trabajo(tx);
        if (inicial) {
          const [clock] = await tx.$queryRaw<
            { ahora: Date }[]
          >`SELECT clock_timestamp() AS ahora`;
          if (entrega)
            await this.validarEntrega(
              tx,
              usuarioId,
              clock.ahora,
              entrega.inicio,
              entrega.expira,
            );
          else {
            const acceso = await this.contexto(tx, usuarioId, clock.ahora);
            if (!acceso?.vinculado || !acceso.habilitaPractica)
              throw new ForbiddenException('Se requiere licencia activa.');
          }
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
        maxWait: 15000,
      },
    );
  }

  private async validarEntrega(
    tx: Tx,
    usuarioId: string,
    ahora: Date,
    iniciadoEn: Date,
    expira: Date | null,
  ) {
    await this.exigirNoRetirado(tx, usuarioId, iniciadoEn);
    const acceso = await this.contexto(tx, usuarioId, ahora);
    if (!acceso) return;
    if (
      !acceso.vinculado ||
      acceso.control.suspendida ||
      (!acceso.propietario &&
        (!acceso.asignacion?.aceptadaEn ||
          acceso.asignacion.aceptadaEn > iniciadoEn))
    )
      throw new ForbiddenException(
        'El intento no tiene una asignación vigente.',
      );
    const periodo = await tx.periodoContratoInstitucional.findFirst({
      where: {
        institucionId: acceso.institucionId,
        inicio: { lte: iniciadoEn },
        fin: { gt: iniciadoEn },
      },
    });
    if (!periodo)
      throw new ForbiddenException(
        'El intento no comenzó con licencia activa.',
      );
    const limite = limiteEntregaInstitucional(
      { ...periodo, suspendida: false },
      iniciadoEn,
      expira,
    );
    if (ahora >= limite)
      throw new ForbiddenException(
        'Terminó el plazo para entregar este intento.',
      );
  }

  private async exigirNoRetirado(tx: Tx, usuarioId: string, iniciadoEn: Date) {
    const salidas = await tx.operacionLicenciaInstitucional.findMany({
      where: {
        tipo: 'VOLVER_PERSONAL',
        resultado: { path: ['usuarioId'], equals: usuarioId },
      },
      select: { resultado: true },
    });
    for (const { resultado } of salidas) {
      if (
        !resultado ||
        typeof resultado !== 'object' ||
        Array.isArray(resultado)
      )
        continue;
      const desde = resultado.vinculadaDesde,
        hasta = resultado.salidaEn;
      if (typeof desde !== 'string' || typeof hasta !== 'string') continue;
      if (new Date(desde) <= iniciadoEn && iniciadoEn <= new Date(hasta))
        throw new ForbiddenException(
          'La vinculación de este intento fue retirada. Tu borrador e historial se conservan; volver a modalidad personal no reactiva ese intento.',
        );
    }
  }
}
