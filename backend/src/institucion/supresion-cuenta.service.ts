import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { purgarDatosPropios } from './supresion-cuenta.purge';

type Tx = Prisma.TransactionClient;
const publicRequest = {
  id: true,
  usuarioId: true,
  solicitanteId: true,
  estado: true,
  creadoEn: true,
  revisadoEn: true,
  ejecutadoEn: true,
  version: true,
} as const;

@Injectable()
export class SupresionCuentaService {
  constructor(private readonly prisma: PrismaService) {}

  private async actor(tx: Tx, actorId: string, admin = false) {
    await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${actorId}::uuid FOR SHARE`;
    const actor = await tx.usuario.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        rol: true,
        institucionId: true,
        suprimidaEn: true,
        debeCambiarContrasena: true,
      },
    });
    if (
      !actor?.rol ||
      actor.suprimidaEn ||
      actor.debeCambiarContrasena ||
      (admin && actor.rol !== 'ADMIN')
    )
      throw new ForbiddenException(
        'Esta acción requiere una sesión autorizada.',
      );
    return actor;
  }

  private async target(tx: Tx, usuarioId: string) {
    const inicial = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { institucionId: true },
    });
    if (!inicial) throw new NotFoundException('Cuenta no disponible.');
    if (inicial.institucionId)
      await tx.$queryRaw`SELECT id FROM "Institucion" WHERE id = ${inicial.institucionId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuarioId}::uuid FOR UPDATE`;
    const user = await tx.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      include: {
        membresiaInstitucion: true,
        origenGestionadoLicencia: true,
      },
    });
    if (user.institucionId !== inicial.institucionId)
      throw new ConflictException(
        'La vinculación cambió. Revisa el estado actual.',
      );
    return user;
  }

  async solicitar(
    actorId: string,
    usuarioId: string,
    operacionId: string,
    motivo: string,
  ) {
    if (!motivo?.trim() || motivo.length > 500)
      throw new BadRequestException(
        'Indica un motivo de hasta 500 caracteres, sin contraseñas ni datos de terceros.',
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const user = await this.target(tx, usuarioId);
          const actor = await this.actor(tx, actorId);
          if (actorId !== usuarioId && actor.rol !== 'ADMIN') {
            const member = await tx.miembroInstitucion.findUnique({
              where: { usuarioId: actorId },
            });
            if (
              !user.origenGestionadoLicencia ||
              actor.rol !== 'PROFESOR' ||
              member?.rol !== 'PROPIETARIO' ||
              member.institucionId !==
                user.origenGestionadoLicencia.institucionId ||
              actor.institucionId !== member.institucionId
            )
              throw new ForbiddenException(
                'El colegio no puede solicitar la eliminación de una cuenta personal o ajena.',
              );
          }
          const previous = await tx.solicitudSupresionCuenta.findUnique({
            where: { operacionId },
          });
          if (previous) {
            if (
              previous.solicitanteId !== actorId ||
              previous.usuarioId !== usuarioId ||
              (previous.estado === 'PENDIENTE' &&
                previous.motivo !== motivo.trim())
            )
              throw new ConflictException(
                'La operación ya corresponde a otra solicitud.',
              );
            return tx.solicitudSupresionCuenta.findUniqueOrThrow({
              where: { id: previous.id },
              select: publicRequest,
            });
          }
          if (user.suprimidaEn || !user.rol)
            throw new ConflictException('La cuenta ya fue suprimida.');
          if (
            user.rol === 'ADMIN' ||
            user.membresiaInstitucion?.rol === 'PROPIETARIO'
          )
            throw new ConflictException(
              'Transfiere las responsabilidades administrativas antes de solicitar la supresión.',
            );
          return tx.solicitudSupresionCuenta.create({
            data: {
              id: randomUUID(),
              operacionId,
              usuarioId,
              solicitanteId: actorId,
              motivo: motivo.trim(),
            },
            select: publicRequest,
          });
        },
        { timeout: 15000, maxWait: 15000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Ya existe una solicitud pendiente o hubo un cambio concurrente. Consulta el estado antes de reenviar.',
        );
      throw error;
    }
  }

  async listar(actorId: string, pagina: number) {
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10000)
      throw new BadRequestException('Página inválida.');
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.actor(tx, actorId);
      const owner = await tx.miembroInstitucion.findUnique({
        where: { usuarioId: actorId },
      });
      const where: Prisma.SolicitudSupresionCuentaWhereInput =
        actor.rol === 'ADMIN'
          ? {}
          : {
              OR: [
                { usuarioId: actorId },
                ...(owner?.rol === 'PROPIETARIO' &&
                owner.institucionId === actor.institucionId
                  ? [
                      {
                        solicitanteId: actorId,
                        usuario: {
                          origenGestionadoLicencia: {
                            institucionId: owner.institucionId,
                          },
                        },
                      },
                    ]
                  : []),
              ],
            };
      const rows = await tx.solicitudSupresionCuenta.findMany({
        where,
        select: publicRequest,
        orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }],
        skip: (pagina - 1) * 20,
        take: 21,
      });
      return {
        pagina,
        tieneSiguiente: rows.length > 20,
        items: rows.slice(0, 20),
      };
    });
  }

  async rechazar(actorId: string, id: string, version: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actorId, true);
      await tx.$queryRaw`SELECT id FROM "SolicitudSupresionCuenta" WHERE id = ${id}::uuid FOR UPDATE`;
      const request = await tx.solicitudSupresionCuenta.findUnique({
        where: { id },
      });
      if (!request) throw new NotFoundException('Solicitud no encontrada.');
      if (request.estado === 'RECHAZADA') return { id, estado: 'RECHAZADA' };
      if (request.estado !== 'PENDIENTE' || request.version !== version)
        throw new ConflictException(
          'La solicitud cambió. Actualiza antes de revisarla.',
        );
      const [clock] = await tx.$queryRaw<
        { ahora: Date }[]
      >`SELECT clock_timestamp() AS ahora`;
      return tx.solicitudSupresionCuenta.update({
        where: { id },
        data: {
          estado: 'RECHAZADA',
          revisorId: actorId,
          revisadoEn: clock.ahora,
          version: { increment: 1 },
        },
        select: publicRequest,
      });
    });
  }

  async revisar(actorId: string, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.actor(tx, actorId, true);
        const request = await tx.solicitudSupresionCuenta.findUnique({
          where: { id },
        });
        if (!request) throw new NotFoundException('Solicitud no encontrada.');
        const user = await this.target(tx, request.usuarioId);
        const counts = await this.counts(tx, user.id);
        const bloqueos = await this.blockers(tx, user.id, user.correo);
        const huella = this.fingerprint(
          request.id,
          request.version,
          user,
          counts,
        );
        return {
          ...request,
          motivo:
            request.estado === 'EJECUTADA'
              ? 'Solicitud anonimizada'
              : request.motivo,
          cuenta: {
            nombre: user.nombre,
            gestionada: Boolean(user.origenGestionadoLicencia),
            suprimida: Boolean(user.suprimidaEn),
          },
          registros: counts,
          bloqueos,
          huellaRevision: huella,
          irreversible: true,
          conservaResultadosCompartidos: true,
          borradoAutomatico: false,
        };
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }

  async ejecutar(
    actorId: string,
    id: string,
    version: number,
    huellaRevision: string,
    confirmacion: string,
  ) {
    if (process.env.ACCOUNT_SUPPRESSION_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'La ejecución de supresiones está deshabilitada en este entorno. La solicitud no se ha borrado.',
      );
    if (confirmacion !== 'SUPRIMIR CUENTA')
      throw new BadRequestException('Confirma expresamente SUPRIMIR CUENTA.');
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.actor(tx, actorId, true);
          const initial = await tx.solicitudSupresionCuenta.findUnique({
            where: { id },
          });
          if (!initial) throw new NotFoundException('Solicitud no encontrada.');
          const user = await this.target(tx, initial.usuarioId);
          await tx.$queryRaw`SELECT id FROM "SolicitudSupresionCuenta" WHERE id=${id}::uuid FOR UPDATE`;
          const request = await tx.solicitudSupresionCuenta.findUniqueOrThrow({
            where: { id },
          });
          if (request.estado === 'EJECUTADA')
            return { id, estado: 'EJECUTADA', repetida: true };
          if (
            request.estado !== 'PENDIENTE' ||
            request.version !== version ||
            user.suprimidaEn
          )
            throw new ConflictException(
              'La solicitud cambió. Consulta su revisión actual.',
            );
          if (
            user.rol === 'ADMIN' ||
            user.membresiaInstitucion?.rol === 'PROPIETARIO' ||
            actorId === user.id
          )
            throw new ConflictException(
              'No se permite suprimir esta responsabilidad administrativa.',
            );
          const counts = await this.counts(tx, user.id);
          if (this.fingerprint(id, version, user, counts) !== huellaRevision)
            throw new ConflictException(
              'Los datos cambiaron desde la revisión. Revisa nuevamente antes de ejecutar.',
            );
          const bloqueos = await this.blockers(tx, user.id, user.correo);
          if (bloqueos.length) throw new ConflictException(bloqueos.join(' '));
          const [clock] = await tx.$queryRaw<
            { ahora: Date }[]
          >`SELECT clock_timestamp() AS ahora`;
          await tx.solicitudSupresionCuenta.update({
            where: { id },
            data: {
              estado: 'EJECUTADA',
              revisorId: actorId,
              revisadoEn: clock.ahora,
              ejecutadoEn: clock.ahora,
              version: { increment: 1 },
            },
          });
          await tx.$queryRaw`SELECT set_config('saberplus.privacy_request',${id},true),set_config('saberplus.privacy_actor',${actorId},true)`;
          await purgarDatosPropios(tx, user.id, clock.ahora);
          return {
            id,
            estado: 'EJECUTADA',
            repetida: false,
            referenciaAnonima: true,
            resultadosCompartidosConservados: true,
          };
        },
        { timeout: 30000, maxWait: 15000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034', 'P2028'].includes(error.code)
      )
        throw new ConflictException(
          'Hubo un cambio concurrente. No repitas la ejecución sin revisar el estado.',
        );
      throw error;
    }
  }

  private async blockers(tx: Tx, usuarioId: string, correo: string | null) {
    const [archivos, contacto, batallas, tira] = await Promise.all([
      tx.archivoEditorial.count({ where: { creadoPorId: usuarioId } }),
      correo
        ? tx.solicitudAltaInstitucion.count({
            where: { solicitanteId: usuarioId, correoInstitucional: correo },
          })
        : Promise.resolve(0),
      tx.batalla.count({
        where: {
          OR: [{ retadorId: usuarioId }, { rivalId: usuarioId }],
          AND: [
            {
              OR: [
                { estado: { in: ['BUSCANDO', 'PENDIENTE', 'ACTIVA'] } },
                { estado: 'FINALIZADA', xpLiquidadoEn: null },
              ],
            },
          ],
        },
      }),
      tx.partidaTiraAfloja.count({
        where: {
          OR: [{ jugadorAId: usuarioId }, { jugadorBId: usuarioId }],
          estado: { in: ['BUSCANDO', 'PREPARANDO', 'ACTIVA'] },
        },
      }),
    ]);
    const [pending] = await tx.$queryRaw<
      { cantidad: bigint }[]
    >`SELECT count(*) AS cantidad FROM "TugCompetitiveSettlement" s JOIN "PartidaTiraAfloja" p ON p.id=s."sourceId"
      WHERE (p."jugadorAId"=${usuarioId}::uuid OR p."jugadorBId"=${usuarioId}::uuid) AND s.state='PENDING'`;
    return [
      ...(archivos
        ? [
            'Transfiere la responsabilidad de los archivos editoriales compartidos antes de suprimir.',
          ]
        : []),
      ...(contacto
        ? [
            'Actualiza primero el contacto institucional: no se elimina un canal de la institución por esta acción.',
          ]
        : []),
      ...(batallas || tira || Number(pending.cantidad)
        ? [
            'Espera a que finalicen y se liquiden las partidas compartidas pendientes.',
          ]
        : []),
    ];
  }

  private fingerprint(
    id: string,
    version: number,
    user: {
      versionSesion: number;
      nombre: string;
      correo: string | null;
      identificadorInstitucional: string | null;
      institucionId: string | null;
    },
    counts: Record<string, number>,
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          id,
          version,
          cuenta: [
            user.versionSesion,
            user.nombre,
            user.correo,
            user.identificadorInstitucional,
            user.institucionId,
          ],
          counts,
        }),
      )
      .digest('hex');
  }

  private async counts(tx: Tx, usuarioId: string) {
    const extra = {
      borradoresSimulacro: await tx.intentoSimulacro.count({
        where: { usuarioId },
      }),
      cuadernoErrores: await tx.cuadernoError.count({ where: { usuarioId } }),
      pomodoros: await tx.pomodoroRegistrado.count({ where: { usuarioId } }),
      planesEstudio: await tx.planEstudioSemanal.count({
        where: { usuarioId },
      }),
      eventosRepaso: await tx.eventoRepasoDiferido.count({
        where: { usuarioId },
      }),
      concesionesJuego: await tx.concesionRecompensaJuego.count({
        where: { usuarioId },
      }),
      identificadoresLogin: await tx.identificadorLogin.count({
        where: { usuarioId },
      }),
      saldosPersonales: await tx.saldoPersonalInstitucional.count({
        where: { usuarioId },
      }),
      grupos: await tx.claseEstudiante.count({ where: { usuarioId } }),
    };
    const [
      respuestas,
      diagnosticos,
      simulacros,
      progreso,
      repasos,
      trivia,
      guardian,
      cima,
      rescate,
      escudo,
      batallas,
      tira,
    ] = await Promise.all([
      tx.historialRespuesta.count({ where: { usuarioId } }),
      tx.diagnosticoInicial.count({ where: { usuarioId } }),
      tx.resultadoSimulacro.count({ where: { usuarioId } }),
      tx.progresoTema.count({ where: { usuarioId } }),
      tx.repasoDiferido.count({ where: { usuarioId } }),
      tx.intentoTriviaRush.count({ where: { usuarioId } }),
      tx.intentoGuardian.count({ where: { usuarioId } }),
      tx.intentoCima.count({ where: { usuarioId } }),
      tx.intentoRescateEstrellas.count({ where: { usuarioId } }),
      tx.intentoEscudoConocimiento.count({ where: { usuarioId } }),
      tx.batallaParticipante.count({ where: { usuarioId } }),
      tx.partidaTiraAfloja.count({
        where: { OR: [{ jugadorAId: usuarioId }, { jugadorBId: usuarioId }] },
      }),
    ]);
    return {
      ...extra,
      respuestas,
      diagnosticos,
      simulacros,
      progreso,
      repasos,
      trivia,
      guardian,
      cima,
      rescate,
      escudo,
      batallasCompartidas: batallas,
      tiraCompartida: tira,
    };
  }
}
