import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TipoCupoInstitucional } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  conservarSaldoPersonal,
  reanudarSaldoPersonal,
} from './saldo-personal-institucional.service';
import {
  finPeriodoInstitucional,
  inicioRenovacionInstitucional,
} from './licencia-institucional.policy';

type Tx = Prisma.TransactionClient;
export interface AcuerdoLicencia {
  operacionId: string;
  meses: number;
  inicio?: string;
  cuposEstudiantes: number;
  cuposDocentes: number;
  referenciaAcuerdo: string;
}

@Injectable()
export class LicenciaInstitucionalService {
  constructor(private readonly prisma: PrismaService) {}

  async esControlada(institucionId: string): Promise<boolean> {
    return Boolean(
      await this.prisma.controlLicenciaInstitucional.findUnique({
        where: { institucionId },
      }),
    );
  }

  async transferirPropiedad(
    actorId: string,
    institucionId: string,
    miembroId: string,
    codigo: string,
  ) {
    return this.transaccion(async (tx) => {
      await this.bloquear(tx, institucionId);
      const actor = await tx.miembroInstitucion.findUnique({
        where: { usuarioId: actorId },
      });
      if (actor?.institucionId !== institucionId || actor.rol !== 'PROPIETARIO')
        throw new ForbiddenException(
          'Solo el propietario actual puede transferir.',
        );
      await this.autorizar(tx, actorId, institucionId, false);
      const institucion = await tx.institucion.findUniqueOrThrow({
        where: { id: institucionId },
      });
      if (institucion.codigoUnico !== codigo.trim().toUpperCase())
        throw new BadRequestException('Código de confirmación no válido.');
      const destino = await tx.miembroInstitucion.findFirst({
        where: { id: miembroId, institucionId, usuarioId: { not: actorId } },
      });
      if (!destino || destino.rol === 'PROPIETARIO')
        throw new BadRequestException('Selecciona otro miembro.');
      const asignacion = await tx.asignacionLicenciaInstitucional.findFirst({
        where: {
          institucionId,
          usuarioId: destino.usuarioId,
          tipo: 'DOCENTE',
          estado: 'ACTIVA',
        },
      });
      if (!asignacion)
        throw new ConflictException(
          'El nuevo propietario debe tener un cupo docente activo.',
        );
      // The incoming owner's seat stops counting as the outgoing owner starts
      // counting (if assigned), so this cannot increase the teacher total.
      await tx.miembroInstitucion.update({
        where: { id: actor.id },
        data: { rol: 'ADMINISTRADOR' },
      });
      await tx.miembroInstitucion.update({
        where: { id: destino.id },
        data: { rol: 'PROPIETARIO' },
      });
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId,
          actorId,
          afectadoId: destino.usuarioId,
          accion: 'PROPIEDAD_TRANSFERIDA',
          detalle: { propietarioAnteriorId: actorId, licencia: true },
        },
      });
      const r = await this.recibo(
        tx,
        actorId,
        institucionId,
        randomUUID(),
        'TRANSFERIR_PROPIEDAD',
        { miembroId },
      );
      await r.guardar({
        propietarioAnteriorId: actorId,
        nuevoPropietarioId: destino.usuarioId,
      });
      return { transferida: true, nuevoPropietarioId: destino.usuarioId };
    });
  }

  private async transaccion<T>(
    trabajo: (tx: Tx) => Promise<T>,
    opciones?: { timeout: number; maxWait: number },
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(trabajo, opciones);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'Conflicto concurrente de licencia; consulta el estado y reintenta la misma operación.',
        );
      throw error;
    }
  }

  private async autorizar(
    tx: Tx,
    actorId: string,
    institucionId: string,
    soloAdmin: boolean,
  ) {
    const actor = await tx.usuario.findUnique({
      where: { id: actorId },
      select: { rol: true, institucionId: true, debeCambiarContrasena: true },
    });
    if (!actor || actor.debeCambiarContrasena)
      throw new ForbiddenException('Sesión no autorizada para licencias.');
    if (actor.rol === 'ADMIN') return;
    const miembro = await tx.miembroInstitucion.findUnique({
      where: { usuarioId: actorId },
    });
    if (
      soloAdmin ||
      actor.rol !== 'PROFESOR' ||
      actor.institucionId !== institucionId ||
      miembro?.institucionId !== institucionId ||
      miembro.rol !== 'PROPIETARIO'
    )
      throw new ForbiddenException(
        'Solo el propietario puede administrar los cupos.',
      );
  }

  // All writers use the same existing institution row, including first activation.
  // Parameterized UUIDs never become SQL fragments. Time is sampled after waiting.
  private async bloquear(tx: Tx, institucionId: string) {
    const filas = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Institucion" WHERE id = ${institucionId}::uuid FOR UPDATE`;
    if (!filas.length)
      throw new NotFoundException('Institución no encontrada.');
    const [reloj] = await tx.$queryRaw<
      { ahora: Date }[]
    >`SELECT clock_timestamp() AS ahora`;
    return reloj.ahora;
  }

  private async recibo(
    tx: Tx,
    actorId: string,
    institucionId: string,
    id: string,
    tipo: string,
    comando: object,
  ) {
    const huella = createHash('sha256')
      .update(JSON.stringify({ tipo, comando }))
      .digest('hex');
    const previo = await tx.operacionLicenciaInstitucional.findUnique({
      where: { id },
    });
    if (
      previo &&
      (previo.actorId !== actorId ||
        previo.institucionId !== institucionId ||
        previo.huella !== huella ||
        previo.tipo !== tipo)
    )
      throw new ConflictException(
        'El identificador de operación ya se utilizó con otro comando.',
      );
    return {
      previo: previo?.resultado,
      guardar: (resultado: Prisma.InputJsonObject) =>
        tx.operacionLicenciaInstitucional
          .create({
            data: { id, actorId, institucionId, tipo, huella, resultado },
          })
          .then(() => resultado),
    };
  }

  async acordar(
    actorId: string,
    institucionId: string,
    dto: AcuerdoLicencia,
    renovar: boolean,
  ) {
    if (
      ![6, 12, 18, 24].includes(dto.meses) ||
      !dto.referenciaAcuerdo?.trim() ||
      dto.referenciaAcuerdo.length > 255 ||
      ![dto.cuposEstudiantes, dto.cuposDocentes].every(
        (n) => Number.isInteger(n) && n >= 0 && n <= 2147483647,
      )
    )
      throw new BadRequestException('Acuerdo institucional no válido.');
    const solicitada = dto.inicio === undefined ? null : new Date(dto.inicio);
    if (solicitada && !Number.isFinite(solicitada.getTime()))
      throw new BadRequestException('Fecha acordada no válida.');
    return this.transaccion(
      async (tx) => {
        const ahora = await this.bloquear(tx, institucionId);
        await this.autorizar(tx, actorId, institucionId, true);
        const r = await this.recibo(
          tx,
          actorId,
          institucionId,
          dto.operacionId,
          renovar ? 'RENOVAR' : 'ACTIVAR',
          {
            meses: dto.meses,
            inicio: solicitada?.toISOString() ?? null,
            cuposEstudiantes: dto.cuposEstudiantes,
            cuposDocentes: dto.cuposDocentes,
            referenciaAcuerdo: dto.referenciaAcuerdo.trim(),
          },
        );
        if (r.previo) return r.previo;
        const ultimo = await tx.periodoContratoInstitucional.findFirst({
          where: { institucionId },
          orderBy: { fin: 'desc' },
        });
        if (renovar !== Boolean(ultimo))
          throw new ConflictException(
            'Usa activación inicial o renovación según el contrato existente.',
          );
        if (
          ultimo &&
          (ultimo.cuposEstudiantes !== dto.cuposEstudiantes ||
            ultimo.cuposDocentes !== dto.cuposDocentes)
        )
          throw new ConflictException(
            'La renovación inicial conserva ambos paquetes de cupos.',
          );
        let inicio = solicitada ?? ahora;
        if (ultimo && ultimo.fin <= ahora && inicio < ahora)
          throw new BadRequestException(
            'La renovación vencida no comienza retroactivamente.',
          );
        if (ultimo)
          inicio = inicioRenovacionInstitucional(ultimo.fin, ahora, inicio);
        else if (inicio < ahora)
          throw new BadRequestException('No se activa cobertura retroactiva.');
        const fin = finPeriodoInstitucional(inicio, dto.meses);
        if (
          await tx.periodoContratoInstitucional.findFirst({
            where: { institucionId, inicio: { lt: fin }, fin: { gt: inicio } },
          })
        )
          throw new ConflictException(
            'El periodo se superpone con otro acuerdo.',
          );
        await tx.controlLicenciaInstitucional.upsert({
          where: { institucionId },
          create: { institucionId },
          update: {},
        });
        const periodo = await tx.periodoContratoInstitucional.create({
          data: {
            id: randomUUID(),
            institucionId,
            inicio,
            fin,
            meses: dto.meses,
            cuposEstudiantes: dto.cuposEstudiantes,
            cuposDocentes: dto.cuposDocentes,
            referenciaAcuerdo: dto.referenciaAcuerdo.trim(),
          },
        });
        return r.guardar({
          periodoId: periodo.id,
          inicio: inicio.toISOString(),
          fin: fin.toISOString(),
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }

  async suspender(
    actorId: string,
    institucionId: string,
    operacionId: string,
    suspendida: boolean,
  ) {
    return this.transaccion(async (tx) => {
      await this.bloquear(tx, institucionId);
      await this.autorizar(tx, actorId, institucionId, true);
      const r = await this.recibo(
        tx,
        actorId,
        institucionId,
        operacionId,
        'SUSPENDER',
        { suspendida },
      );
      if (r.previo) return r.previo;
      if (
        !(await tx.controlLicenciaInstitucional.findUnique({
          where: { institucionId },
        }))
      )
        throw new NotFoundException('Licencia no incorporada.');
      await tx.controlLicenciaInstitucional.update({
        where: { institucionId },
        data: { suspendida },
      });
      return r.guardar({ suspendida });
    });
  }

  private async periodoActivo(tx: Tx, institucionId: string, ahora: Date) {
    const control = await tx.controlLicenciaInstitucional.findUnique({
      where: { institucionId },
    });
    const periodo = await tx.periodoContratoInstitucional.findFirst({
      where: { institucionId, inicio: { lte: ahora }, fin: { gt: ahora } },
    });
    if (!control || control.suspendida || !periodo)
      throw new ForbiddenException(
        'Se requiere una licencia institucional activa.',
      );
    return periodo;
  }

  private async destino(
    tx: Tx,
    institucionId: string,
    usuarioId: string,
    tipo: TipoCupoInstitucional,
  ) {
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      include: { membresiaInstitucion: true, origenGestionadoLicencia: true },
    });
    if (
      !usuario ||
      usuario.rol !== (tipo === 'ESTUDIANTE' ? 'ESTUDIANTE' : 'PROFESOR')
    )
      throw new BadRequestException('Rol del destinatario no válido.');
    if (
      (usuario.institucionId && usuario.institucionId !== institucionId) ||
      (usuario.origenGestionadoLicencia &&
        usuario.origenGestionadoLicencia.institucionId !== institucionId)
    )
      throw new ConflictException('La cuenta pertenece a otra institución.');
    if (
      tipo === 'DOCENTE' &&
      (usuario.membresiaInstitucion?.institucionId !== institucionId ||
        usuario.membresiaInstitucion.rol === 'PROPIETARIO')
    )
      throw new BadRequestException(
        'El docente debe tener membresía; el propietario no consume cupo.',
      );
    return usuario;
  }

  private async comprobarCupo(
    tx: Tx,
    institucionId: string,
    tipo: TipoCupoInstitucional,
    ahora: Date,
  ) {
    const periodo = await this.periodoActivo(tx, institucionId, ahora);
    const propietarios = await tx.miembroInstitucion.findMany({
      where: { institucionId, rol: 'PROPIETARIO' },
      select: { usuarioId: true },
    });
    const ocupados = await tx.asignacionLicenciaInstitucional.count({
      where: {
        institucionId,
        tipo,
        estado: 'ACTIVA',
        ...(tipo === 'DOCENTE'
          ? { usuarioId: { notIn: propietarios.map((p) => p.usuarioId) } }
          : {}),
      },
    });
    const limite =
      tipo === 'ESTUDIANTE' ? periodo.cuposEstudiantes : periodo.cuposDocentes;
    if (ocupados >= limite)
      throw new ConflictException('No quedan cupos disponibles.');
  }

  async asignar(
    actorId: string,
    institucionId: string,
    operacionId: string,
    usuarioId: string,
    tipo: TipoCupoInstitucional,
  ) {
    return this.transaccion(
      async (tx) => {
        const ahora = await this.bloquear(tx, institucionId);
        await this.autorizar(tx, actorId, institucionId, false);
        const r = await this.recibo(
          tx,
          actorId,
          institucionId,
          operacionId,
          'ASIGNAR',
          { usuarioId, tipo },
        );
        if (r.previo) return r.previo;
        await this.periodoActivo(tx, institucionId, ahora);
        const usuario = await this.destino(tx, institucionId, usuarioId, tipo);
        const existente = await tx.asignacionLicenciaInstitucional.findUnique({
          where: { institucionId_usuarioId: { institucionId, usuarioId } },
        });
        if (existente && existente.estado !== 'RETIRADA')
          throw new ConflictException('Ya existe una asignación o invitación.');
        const gestionada =
          usuario.origenGestionadoLicencia?.institucionId === institucionId;
        if (gestionada)
          await this.comprobarCupo(tx, institucionId, tipo, ahora);
        const data = {
          tipo,
          estado: gestionada ? ('ACTIVA' as const) : ('PENDIENTE' as const),
          aceptadaEn: gestionada ? ahora : null,
          retiradaEn: null,
        };
        const asignacion = await tx.asignacionLicenciaInstitucional.upsert({
          where: { institucionId_usuarioId: { institucionId, usuarioId } },
          create: { id: randomUUID(), institucionId, usuarioId, ...data },
          update: data,
        });
        if (gestionada)
          await tx.usuario.update({
            where: { id: usuarioId },
            data: { institucionId },
          });
        return r.guardar({
          asignacionId: asignacion.id,
          estado: asignacion.estado,
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }

  async aceptar(actorId: string, institucionId: string, operacionId: string) {
    return this.transaccion(
      async (tx) => {
        const ahora = await this.bloquear(tx, institucionId);
        const actor = await tx.usuario.findUnique({ where: { id: actorId } });
        if (!actor || actor.debeCambiarContrasena)
          throw new ForbiddenException('Sesión no autorizada.');
        const r = await this.recibo(
          tx,
          actorId,
          institucionId,
          operacionId,
          'ACEPTAR',
          {},
        );
        if (r.previo) return r.previo;
        const asignacion = await tx.asignacionLicenciaInstitucional.findUnique({
          where: {
            institucionId_usuarioId: { institucionId, usuarioId: actorId },
          },
        });
        if (!asignacion || asignacion.estado !== 'PENDIENTE')
          throw new ConflictException('No hay invitación pendiente.');
        await this.destino(tx, institucionId, actorId, asignacion.tipo);
        await this.comprobarCupo(tx, institucionId, asignacion.tipo, ahora);
        await tx.asignacionLicenciaInstitucional.update({
          where: { id: asignacion.id },
          data: { estado: 'ACTIVA', aceptadaEn: ahora },
        });
        await tx.usuario.update({
          where: { id: actorId },
          data: { institucionId },
        });
        await conservarSaldoPersonal(tx, actorId, asignacion.id);
        return r.guardar({ asignacionId: asignacion.id, estado: 'ACTIVA' });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }

  async retirar(
    actorId: string,
    institucionId: string,
    operacionId: string,
    usuarioId: string,
    versionAsignacion?: string,
  ) {
    return this.transaccion(async (tx) => {
      const ahora = await this.bloquear(tx, institucionId);
      await this.autorizar(tx, actorId, institucionId, false);
      const r = await this.recibo(
        tx,
        actorId,
        institucionId,
        operacionId,
        'RETIRAR',
        { usuarioId, ...(versionAsignacion ? { versionAsignacion } : {}) },
      );
      if (r.previo) return r.previo;
      const asignacion = await tx.asignacionLicenciaInstitucional.findUnique({
        where: { institucionId_usuarioId: { institucionId, usuarioId } },
      });
      if (!asignacion) throw new NotFoundException('Asignación no encontrada.');
      if (
        versionAsignacion &&
        asignacion.actualizadoEn.toISOString() !== versionAsignacion
      )
        throw new ConflictException(
          'La asignación cambió; actualiza antes de retirar.',
        );
      await tx.asignacionLicenciaInstitucional.update({
        where: { id: asignacion.id },
        data: { estado: 'RETIRADA', retiradaEn: ahora },
      });
      return r.guardar({ asignacionId: asignacion.id, estado: 'RETIRADA' });
    });
  }

  async volverPersonal(
    actorId: string,
    institucionId: string,
    operacionId: string,
    usuarioId: string,
    asignacionId: string,
    versionAsignacion: string,
  ) {
    const version = new Date(versionAsignacion);
    if (!Number.isFinite(version.getTime()))
      throw new BadRequestException('Versión de asignación no válida.');
    return this.transaccion(
      async (tx) => {
        const ahora = await this.bloquear(tx, institucionId);
        const actor = await tx.usuario.findUnique({ where: { id: actorId } });
        if (!actor || actor.debeCambiarContrasena)
          throw new ForbiddenException('Sesión no autorizada.');
        const propia = actorId === usuarioId;
        if (!propia) await this.autorizar(tx, actorId, institucionId, false);
        const recibo = await this.recibo(
          tx,
          actorId,
          institucionId,
          operacionId,
          'VOLVER_PERSONAL',
          { usuarioId, asignacionId, versionAsignacion: version.toISOString() },
        );
        // A replay returns its old receipt; it never detaches a later membership.
        if (recibo.previo) return recibo.previo;
        await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuarioId}::uuid FOR UPDATE`;
        const usuario = await tx.usuario.findUnique({
          where: { id: usuarioId },
          include: {
            origenGestionadoLicencia: true,
            membresiaInstitucion: true,
          },
        });
        if (!usuario || usuario.institucionId !== institucionId)
          throw new NotFoundException('Cuenta vinculada no encontrada.');
        if (
          usuario.origenGestionadoLicencia ||
          usuario.identificadorInstitucional
        )
          throw new ForbiddenException(
            'Una cuenta gestionada no se convierte en personal desde esta acción.',
          );
        if (
          !['ESTUDIANTE', 'PROFESOR'].includes(usuario.rol ?? '') ||
          usuario.membresiaInstitucion?.rol === 'PROPIETARIO'
        )
          throw new ForbiddenException(
            'Transfiere la propiedad antes de solicitar la salida.',
          );
        const asignacion = await tx.asignacionLicenciaInstitucional.findUnique({
          where: { institucionId_usuarioId: { institucionId, usuarioId } },
        });
        if (
          !asignacion ||
          asignacion.id !== asignacionId ||
          asignacion.actualizadoEn.getTime() !== version.getTime()
        )
          throw new ConflictException(
            'La asignación cambió; actualiza su estado antes de confirmar.',
          );
        if (
          await tx.asignacionLicenciaInstitucional.findFirst({
            where: {
              usuarioId,
              estado: 'ACTIVA',
              institucionId: { not: institucionId },
            },
          })
        )
          throw new ConflictException(
            'Existe otra vinculación activa; solicita revisión a SaberPlus.',
          );
        if (propia) {
          const activo = await tx.periodoContratoInstitucional.findFirst({
            where: {
              institucionId,
              inicio: { lte: ahora },
              fin: { gt: ahora },
            },
          });
          const vencido = await tx.periodoContratoInstitucional.findFirst({
            where: { institucionId, fin: { lte: ahora } },
            orderBy: { fin: 'desc' },
          });
          if (activo || !vencido)
            throw new ForbiddenException(
              'Durante la cobertura o antes del primer vencimiento, solicita la salida al propietario.',
            );
        }
        // No deletes of answers, attempts, diagnosis or the personal identity.
        await tx.asignacionLicenciaInstitucional.update({
          where: { id: asignacion.id },
          data: { estado: 'RETIRADA', retiradaEn: ahora },
        });
        await tx.claseEstudiante.deleteMany({
          where: { usuarioId, Clase: { institucionId } },
        });
        if (usuario.membresiaInstitucion) {
          if (usuario.membresiaInstitucion.institucionId !== institucionId)
            throw new ConflictException(
              'La membresía pertenece a otra institución.',
            );
          await tx.claseProfesor.deleteMany({
            where: { miembroId: usuario.membresiaInstitucion.id },
          });
          await tx.miembroInstitucion.delete({
            where: { id: usuario.membresiaInstitucion.id },
          });
        }
        await tx.usuario.update({
          where: { id: usuarioId },
          data: { institucionId: null },
        });
        await reanudarSaldoPersonal(tx, usuarioId);
        await tx.auditoriaInstitucion.create({
          data: {
            institucionId,
            actorId,
            afectadoId: usuarioId,
            accion: 'RETORNO_PERSONAL',
            detalle: { asignacionId, historialConservado: true },
          },
        });
        return recibo.guardar({
          usuarioId,
          modalidad: 'PERSONAL',
          historialConservado: true,
          vinculadaDesde: asignacion.aceptadaEn?.toISOString() ?? null,
          salidaEn: ahora.toISOString(),
        });
      },
      { timeout: 15000, maxWait: 15000 },
    );
  }

  async bajas(actorId: string, institucionId: string, pagina: number) {
    if (!Number.isInteger(pagina) || pagina < 1 || pagina > 10000)
      throw new BadRequestException('Página no válida.');
    return this.prisma.$transaction(async (tx) => {
      await this.autorizar(tx, actorId, institucionId, false);
      const rows = await tx.asignacionLicenciaInstitucional.findMany({
        where: { institucionId, usuario: { suprimidaEn: null } },
        orderBy: { id: 'asc' },
        skip: (pagina - 1) * 20,
        take: 21,
        select: {
          id: true,
          usuarioId: true,
          tipo: true,
          estado: true,
          actualizadoEn: true,
          usuario: {
            select: {
              nombre: true,
              institucionId: true,
              identificadorInstitucional: true,
              origenGestionadoLicencia: { select: { institucionId: true } },
              membresiaInstitucion: { select: { rol: true } },
            },
          },
        },
      });
      return {
        pagina,
        tieneSiguiente: rows.length > 20,
        items: rows.slice(0, 20).map(({ usuario, ...row }) => ({
          ...row,
          nombre: usuario.nombre,
          usuarioInstitucional: usuario.identificadorInstitucional,
          vinculada: usuario.institucionId === institucionId,
          gestionada: Boolean(usuario.origenGestionadoLicencia),
          propietario: usuario.membresiaInstitucion?.rol === 'PROPIETARIO',
        })),
      };
    });
  }

  async miSalida(actorId: string, institucionId: string) {
    return this.prisma.$transaction(async (tx) => {
      const ahora = await this.bloquear(tx, institucionId);
      const actor = await tx.usuario.findUnique({
        where: { id: actorId },
        include: {
          origenGestionadoLicencia: true,
          membresiaInstitucion: true,
        },
      });
      if (
        !actor ||
        actor.institucionId !== institucionId ||
        actor.debeCambiarContrasena
      )
        throw new ForbiddenException(
          'No tienes una vinculación disponible para esta consulta.',
        );
      const seat = await tx.asignacionLicenciaInstitucional.findUnique({
        where: {
          institucionId_usuarioId: { institucionId, usuarioId: actorId },
        },
      });
      const activo = await tx.periodoContratoInstitucional.findFirst({
        where: { institucionId, inicio: { lte: ahora }, fin: { gt: ahora } },
      });
      const vencido = await tx.periodoContratoInstitucional.findFirst({
        where: { institucionId, fin: { lte: ahora } },
        orderBy: { fin: 'desc' },
      });
      return {
        puedeVolver: Boolean(
          seat &&
          vencido &&
          !activo &&
          !actor.origenGestionadoLicencia &&
          !actor.identificadorInstitucional &&
          actor.membresiaInstitucion?.rol !== 'PROPIETARIO',
        ),
        gestionada: Boolean(actor.origenGestionadoLicencia),
        asignacionId: seat?.id ?? null,
        versionAsignacion: seat?.actualizadoEn.toISOString() ?? null,
      };
    });
  }

  async consultar(actorId: string, institucionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.autorizar(tx, actorId, institucionId, false);
      return tx.controlLicenciaInstitucional.findUnique({
        where: { institucionId },
        include: {
          periodos: { orderBy: { inicio: 'asc' } },
          asignaciones: {
            select: {
              id: true,
              usuarioId: true,
              tipo: true,
              estado: true,
              aceptadaEn: true,
              retiradaEn: true,
              actualizadoEn: true,
            },
          },
        },
      });
    });
  }
}
