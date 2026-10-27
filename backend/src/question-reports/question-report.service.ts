import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OrigenRespuesta,
  Prisma,
  RolUsuario,
  TipoOperacionReportePregunta,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminQuestionReportQuery,
  CreateQuestionReportDto,
  QuestionReportPageDto,
  ReviewQuestionReportDto,
} from './question-report.dto';
import {
  REPORT_DAILY_LIMIT,
  REPORT_DAY_MS,
  REPORT_MINUTE_LIMIT,
  reportFingerprint,
  reportLimit,
  requireReportTransition,
  validateReportDetail,
} from './question-report.policy';

const unavailable = () =>
  new NotFoundException({
    code: 'REPORT_NOT_AVAILABLE',
    message: 'Reporte u operación no disponible.',
  });
const conflict = () =>
  new ConflictException({
    code: 'REPORT_OPERATION_CONFLICT',
    message: 'El envío cambió. Consulta el recibo antes de continuar.',
  });
const evidenceOrigins = [
  OrigenRespuesta.PRACTICA,
  OrigenRespuesta.PERSONALIZADO,
  OrigenRespuesta.SIMULACRO,
];
const publicSelection = {
  id: true,
  preguntaId: true,
  motivo: true,
  detalle: true,
  estado: true,
  revision: true,
  fechaCreacion: true,
  fechaActualizacion: true,
} satisfies Prisma.ReportePreguntaSelect;
type VisibleReport = Prisma.ReportePreguntaGetPayload<{
  select: typeof publicSelection;
}>;

@Injectable()
export class QuestionReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        // Raw SELECT ... FOR UPDATE can surface a PostgreSQL serialization
        // conflict/deadlock as P2010 instead of P2034. Retry only those SQLSTATEs;
        // permission, schema and other SQL errors must keep their safe 503 path.
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (['P2002', 'P2034'].includes(error.code) ||
            (error.code === 'P2010' &&
              (error.meta?.code === '40001' || error.meta?.code === '40P01')));
        if (!retryable) throw error;
        if (attempt === 2) throw conflict();
      }
    }
    throw conflict();
  }

  private async actor(
    db: Prisma.TransactionClient,
    id: string,
    role: RolUsuario,
  ) {
    const user = await db.usuario.findUnique({
      where: { id },
      select: { rol: true, correoVerificado: true },
    });
    if (!user) throw new UnauthorizedException('La cuenta no está disponible.');
    if (user.rol !== role)
      throw new ForbiddenException(
        'Esta cuenta no tiene permiso para esta operación.',
      );
    // Report-specific rule: the shared email guard exempts institutional accounts.
    if (role === 'ESTUDIANTE' && user.correoVerificado !== true)
      throw new ForbiddenException({
        code: 'REPORT_EMAIL_REQUIRED',
        message: 'Verifica tu correo antes de enviar o consultar reportes.',
      });
  }

  private async lockActor(
    tx: Prisma.TransactionClient,
    actorId: string,
    role: RolUsuario,
  ) {
    await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${actorId}::uuid FOR UPDATE`;
    await this.actor(tx, actorId, role);
  }

  /** Committed independently: business rollback must not reset the request rate. */
  private async writeRate(actorId: string, role: RolUsuario) {
    await this.transaction(async (tx) => {
      await this.lockActor(tx, actorId, role);
      const now = new Date();
      const rate = await tx.tasaReportePregunta.findUnique({
        where: { usuarioId: actorId },
      });
      const active = rate && now.getTime() - rate.inicio.getTime() < 60000;
      if (active && rate.solicitudes >= REPORT_MINUTE_LIMIT) {
        reportLimit(
          'REPORT_RATE_LIMIT',
          (rate.inicio.getTime() + 60000 - now.getTime()) / 1000,
        );
      }
      const data = active
        ? { solicitudes: rate.solicitudes + 1 }
        : { inicio: now, solicitudes: 1 };
      await tx.tasaReportePregunta.upsert({
        where: { usuarioId: actorId },
        update: data,
        create: { usuarioId: actorId, inicio: now, solicitudes: 1 },
      });
    });
  }

  private publicView(row: VisibleReport) {
    return {
      id: row.id,
      preguntaId: row.preguntaId,
      motivo: row.motivo,
      detalle: row.detalle,
      estado: row.estado,
      revision: row.revision,
      fechaCreacion: row.fechaCreacion.toISOString(),
      fechaActualizacion: row.fechaActualizacion.toISOString(),
    };
  }

  private async replay(
    tx: Prisma.TransactionClient,
    id: string,
    actorId: string,
    type: TipoOperacionReportePregunta,
    fingerprint: string,
  ) {
    const receipt = await tx.operacionReportePregunta.findUnique({
      where: { id },
    });
    if (!receipt) return null;
    if (receipt.actorId !== actorId) throw unavailable();
    if (receipt.tipo !== type || receipt.huellaSolicitud !== fingerprint)
      throw conflict();
    return receipt.resultado;
  }

  private async recordReceipt(
    tx: Prisma.TransactionClient,
    id: string,
    actorId: string,
    reporteId: string,
    tipo: TipoOperacionReportePregunta,
    huellaSolicitud: string,
    resultado: Prisma.InputJsonValue,
  ) {
    await tx.operacionReportePregunta.create({
      data: { id, actorId, reporteId, tipo, huellaSolicitud, resultado },
    });
    return resultado;
  }

  async create(actorId: string, dto: CreateQuestionReportDto) {
    const detail = dto.detalle?.trim() || '';
    validateReportDetail(dto.motivo, detail);
    const payload = {
      preguntaId: dto.preguntaId,
      motivo: dto.motivo,
      detalle: detail,
    };
    const hash = reportFingerprint(actorId, 'CREAR', payload);
    const operationId = dto.operacionId.toLowerCase();
    await this.writeRate(actorId, 'ESTUDIANTE');
    return this.transaction(async (tx) => {
      await this.lockActor(tx, actorId, 'ESTUDIANTE');
      const replay = await this.replay(tx, operationId, actorId, 'CREAR', hash);
      if (replay) return replay;
      const previous = await tx.reportePregunta.findUnique({
        where: {
          autorId_preguntaId_motivo: {
            autorId: actorId,
            preguntaId: dto.preguntaId,
            motivo: dto.motivo,
          },
        },
        select: publicSelection,
      });
      if (previous)
        return this.recordReceipt(
          tx,
          operationId,
          actorId,
          previous.id,
          'CREAR',
          hash,
          { ...this.publicView(previous), duplicado: true },
        );

      const witness = await tx.historialRespuesta.findFirst({
        where: {
          usuarioId: actorId,
          preguntaId: dto.preguntaId,
          origen: { in: evidenceOrigins },
        },
        orderBy: [{ fechaRespuesta: 'desc' }, { id: 'asc' }],
        select: { origen: true, fechaRespuesta: true },
      });
      if (!witness) throw unavailable();
      const question = await tx.pregunta.findUnique({
        where: { id: dto.preguntaId },
        select: {
          id: true,
          enunciado: true,
          explicacion: true,
          imagenUrl: true,
          dificultad: true,
          estadoContenido: true,
          casoId: true,
          ordenEnCaso: true,
          caso: {
            select: { id: true, titulo: true, contexto: true, imagenUrl: true },
          },
          subtema: {
            select: {
              id: true,
              nombre: true,
              tema: { select: { id: true, nombre: true, area: true } },
            },
          },
          respuestas: {
            orderBy: { id: 'asc' },
            select: {
              id: true,
              texto: true,
              explicacion: true,
              esCorrecta: true,
            },
          },
        },
      });
      if (
        !question ||
        !['PUBLICADO', 'ARCHIVADO'].includes(question.estadoContenido)
      )
        throw unavailable();
      const now = new Date();
      const count = await tx.reportePregunta.count({
        where: {
          autorId: actorId,
          fechaCreacion: { gt: new Date(now.getTime() - REPORT_DAY_MS) },
        },
      });
      if (count >= REPORT_DAILY_LIMIT)
        reportLimit('REPORT_DAILY_LIMIT', REPORT_DAY_MS / 1000);
      const metadata = {
        version: 1,
        tipo: 'CAPTURA_SERVIDOR_RECEPCION',
        historicoExacto: false,
        capturadoEn: now.toISOString(),
        origenAcreditado: witness.origen,
        respuestaAcreditadaEn: witness.fechaRespuesta.toISOString(),
      };
      const full = { ...metadata, contenidoOmitido: false, pregunta: question };
      // Bound legacy payloads, not compliant editorial questions. Never pretend a partial copy is exact.
      const snapshot =
        Buffer.byteLength(JSON.stringify(full), 'utf8') <= 512 * 1024
          ? full
          : {
              ...metadata,
              contenidoOmitido: true,
              motivoOmision: 'LIMITE_LEGADO',
              preguntaId: question.id,
            };
      const report = await tx.reportePregunta.create({
        data: {
          autorId: actorId,
          preguntaId: dto.preguntaId,
          motivo: dto.motivo,
          detalle: detail || null,
          areaCapturada: question.subtema.tema.area,
          subtemaIdCapturado: question.subtema.id,
          snapshot,
          fechaCreacion: now,
          fechaActualizacion: now,
        },
      });
      await tx.auditoriaReportePregunta.create({
        data: {
          reporteId: report.id,
          actorId,
          estadoNuevo: 'PENDIENTE',
          revision: 0,
        },
      });
      return this.recordReceipt(
        tx,
        operationId,
        actorId,
        report.id,
        'CREAR',
        hash,
        { ...this.publicView(report), duplicado: false },
      );
    });
  }

  async ownReceipt(actorId: string, operationId: string) {
    await this.actor(this.prisma, actorId, 'ESTUDIANTE');
    const receipt = await this.prisma.operacionReportePregunta.findFirst({
      where: { id: operationId, actorId, tipo: 'CREAR' },
      select: { resultado: true },
    });
    if (!receipt) throw unavailable();
    return receipt.resultado;
  }

  async own(actorId: string, query: QuestionReportPageDto) {
    await this.actor(this.prisma, actorId, 'ESTUDIANTE');
    const rows = await this.prisma.reportePregunta.findMany({
      where: { autorId: actorId },
      select: publicSelection,
      orderBy: [{ fechaCreacion: 'desc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * query.limite,
      take: query.limite + 1,
    });
    return {
      items: rows.slice(0, query.limite).map((r) => this.publicView(r)),
      pagina: query.pagina,
      limite: query.limite,
      hayMas: rows.length > query.limite,
    };
  }

  async list(actorId: string, query: AdminQuestionReportQuery) {
    await this.actor(this.prisma, actorId, 'ADMIN');
    if (query.subtemaId && query.area) {
      const subtopic = await this.prisma.subtema.findFirst({
        where: { id: query.subtemaId, tema: { area: query.area } },
        select: { id: true },
      });
      if (!subtopic) throw unavailable();
    }
    const rows = await this.prisma.reportePregunta.findMany({
      select: {
        ...publicSelection,
        areaCapturada: true,
        subtemaIdCapturado: true,
      },
      where: {
        ...(query.area ? { areaCapturada: query.area } : {}),
        ...(query.subtemaId ? { subtemaIdCapturado: query.subtemaId } : {}),
        ...(query.estado ? { estado: query.estado } : {}),
        ...(query.motivo ? { motivo: query.motivo } : {}),
      },
      orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * query.limite,
      take: query.limite + 1,
    });
    return {
      items: rows.slice(0, query.limite).map((r) => ({
        ...this.publicView(r),
        area: r.areaCapturada,
        subtemaId: r.subtemaIdCapturado,
      })),
      pagina: query.pagina,
      limite: query.limite,
      hayMas: rows.length > query.limite,
    };
  }

  async detail(actorId: string, id: string) {
    await this.actor(this.prisma, actorId, 'ADMIN');
    const report = await this.prisma.reportePregunta.findUnique({
      where: { id },
      include: {
        auditorias: { orderBy: { revision: 'asc' } },
      },
    });
    if (!report) throw unavailable();
    return {
      ...this.publicView(report),
      area: report.areaCapturada,
      subtemaId: report.subtemaIdCapturado,
      snapshot: report.snapshot,
      auditoria: report.auditorias,
    };
  }

  async review(actorId: string, id: string, dto: ReviewQuestionReportDto) {
    const payload = {
      reporteId: id,
      revision: dto.revision,
      destino: dto.destino,
      motivoRevision: dto.motivoRevision.trim(),
    };
    const hash = reportFingerprint(actorId, 'DECIDIR', payload);
    const operationId = dto.operacionId.toLowerCase();
    await this.writeRate(actorId, 'ADMIN');
    return this.transaction(async (tx) => {
      await this.lockActor(tx, actorId, 'ADMIN');
      const replay = await this.replay(
        tx,
        operationId,
        actorId,
        'DECIDIR',
        hash,
      );
      if (replay) return replay;
      await tx.$queryRaw`SELECT id FROM "ReportePregunta" WHERE id = ${id}::uuid FOR UPDATE`;
      const report = await tx.reportePregunta.findUnique({
        where: { id },
        select: publicSelection,
      });
      if (!report) throw unavailable();
      if (report.revision !== dto.revision) throw conflict();
      requireReportTransition(report.estado, dto.destino);
      const changed = await tx.reportePregunta.updateMany({
        where: { id, revision: dto.revision, estado: report.estado },
        data: {
          estado: dto.destino,
          revision: { increment: 1 },
          fechaActualizacion: new Date(),
        },
      });
      if (changed.count !== 1) throw conflict();
      const updated = await tx.reportePregunta.findUniqueOrThrow({
        where: { id },
        select: publicSelection,
      });
      await tx.auditoriaReportePregunta.create({
        data: {
          reporteId: id,
          actorId,
          estadoAnterior: report.estado,
          estadoNuevo: dto.destino,
          revision: updated.revision,
          motivoRevision: payload.motivoRevision,
        },
      });
      return this.recordReceipt(
        tx,
        operationId,
        actorId,
        id,
        'DECIDIR',
        hash,
        this.publicView(updated),
      );
    });
  }
}
