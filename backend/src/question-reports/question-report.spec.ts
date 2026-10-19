import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import { EstadoReportePregunta as State, Prisma } from '@prisma/client';
import { AdminGuard, JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminQuestionReportController,
  QuestionReportController,
} from './question-report.controller';
import {
  AdminQuestionReportQuery,
  CreateQuestionReportDto,
  QuestionReportPageDto,
  ReviewQuestionReportDto,
} from './question-report.dto';
import { reportIpOptions } from './question-report.module';
import {
  reportFingerprint,
  requireReportTransition,
  validateReportDetail,
} from './question-report.policy';
import { QuestionReportService } from './question-report.service';
import { QuestionReportStorageFilter } from './question-report-storage.filter';
import { ArgumentsHost } from '@nestjs/common';

const actor = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const secondOperation = '44444444-4444-4444-8444-444444444444';
const time = new Date('2026-10-17T18:00:00Z');
const record = (extra: object = {}) => ({
  id: reportId,
  autorId: actor,
  preguntaId: 'question-legacy-id',
  motivo: 'IMAGEN_NO_CARGA',
  detalle: 'Imagen rota',
  areaCapturada: 'MATEMATICAS',
  subtemaIdCapturado: 'subtopic',
  snapshot: { secreto: 'solo admin' },
  estado: 'PENDIENTE',
  revision: 0,
  fechaCreacion: time,
  fechaActualizacion: time,
  ...extra,
});
const input = (): CreateQuestionReportDto => ({
  operacionId: operationId,
  preguntaId: 'question-legacy-id',
  motivo: 'IMAGEN_NO_CARGA',
  detalle: ' Imagen rota ',
});
function setup() {
  const receipts = new Map<string, any>();
  const db = {
    usuario: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ rol: 'ESTUDIANTE', correoVerificado: true }),
      update: jest.fn(),
    },
    tasaReportePregunta: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    reportePregunta: {
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ ...record(), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue(record({ estado: 'EN_REVISION', revision: 1 })),
    },
    operacionReportePregunta: {
      findUnique: jest
        .fn()
        .mockImplementation(({ where }) => receipts.get(where.id) ?? null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => {
        receipts.set(data.id, data);
        return data;
      }),
    },
    historialRespuesta: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ origen: 'PRACTICA', fechaRespuesta: time }),
    },
    pregunta: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'question-legacy-id',
        enunciado: '2+1',
        estadoContenido: 'ARCHIVADO',
        subtema: {
          id: 'subtopic',
          nombre: 'Sumas',
          tema: { id: 'theme', nombre: 'Operaciones', area: 'MATEMATICAS' },
        },
        respuestas: [
          {
            id: 'answer',
            texto: '3',
            esCorrecta: true,
            explicacion: 'Una solución',
          },
        ],
        caso: {
          id: 'case',
          contexto: 'Texto común',
          imagenUrl: 'https://example.test/context.png',
        },
      }),
      update: jest.fn(),
    },
    auditoriaReportePregunta: { create: jest.fn() },
    subtema: { findFirst: jest.fn().mockResolvedValue({ id: 'subtopic' }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  db.$transaction.mockImplementation((fn) => fn(db));
  return {
    db,
    receipts,
    service: new QuestionReportService(db as unknown as PrismaService),
  };
}

describe('academic question reports: creation and isolation', () => {
  it('captures server data for an answered archived ID, never changes question or XP', async () => {
    const { db, service } = setup();
    const result: any = await service.create(actor, input());
    expect(result).toMatchObject({
      id: reportId,
      duplicado: false,
      estado: 'PENDIENTE',
      detalle: 'Imagen rota',
    });
    expect(result).not.toHaveProperty('snapshot');
    expect(result).not.toHaveProperty('autorId');
    expect(db.pregunta.update).not.toHaveBeenCalled();
    expect(db.usuario.update).not.toHaveBeenCalled();
    expect(db.historialRespuesta.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          usuarioId: actor,
          preguntaId: 'question-legacy-id',
          origen: { in: ['PRACTICA', 'PERSONALIZADO', 'SIMULACRO'] },
        },
      }),
    );
    const captured = db.reportePregunta.create.mock.calls[0][0].data;
    expect(captured).toMatchObject({
      autorId: actor,
      preguntaId: 'question-legacy-id',
      subtemaIdCapturado: 'subtopic',
      snapshot: {
        historicoExacto: false,
        contenidoOmitido: false,
        origenAcreditado: 'PRACTICA',
        pregunta: { estadoContenido: 'ARCHIVADO' },
      },
    });
    expect(db.auditoriaReportePregunta.create).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledTimes(2); // durable rate and business transaction
    expect(db.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it.each(['PROFESOR', 'ADMIN'])(
    'rejects creation from %s despite an asserted client role',
    async (rol) => {
      const { db, service } = setup();
      db.usuario.findUnique.mockResolvedValue({ rol, correoVerificado: true });
      await expect(service.create(actor, input())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.reportePregunta.create).not.toHaveBeenCalled();
    },
  );
  it('rejects missing accounts', async () => {
    const { db, service } = setup();
    db.usuario.findUnique.mockResolvedValue(null);
    await expect(service.create(actor, input())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it('requires actual verified email even when the institutional shared guard would exempt it', async () => {
    const { db, service } = setup();
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      correoVerificado: false,
      institucionId: 'i',
    });
    await expect(service.create(actor, input())).rejects.toMatchObject({
      status: 403,
    });
    expect(db.reportePregunta.create).not.toHaveBeenCalled();
  });
  it('rejects a guessed question without personal supported history', async () => {
    const { db, service } = setup();
    db.historialRespuesta.findFirst.mockResolvedValue(null);
    await expect(service.create(actor, input())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.pregunta.findUnique).not.toHaveBeenCalled();
  });
  it.each([null, { estadoContenido: 'BORRADOR' }])(
    'does not expose unavailable content %p',
    async (question) => {
      const { db, service } = setup();
      db.pregunta.findUnique.mockResolvedValue(question);
      await expect(service.create(actor, input())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    },
  );
  it('same operation and normalized payload returns the original receipt without writes', async () => {
    const { db, service } = setup();
    const first = await service.create(actor, input());
    const replay = await service.create(actor, {
      ...input(),
      detalle: 'Imagen rota',
    });
    expect(replay).toEqual(first);
    expect(db.reportePregunta.create).toHaveBeenCalledTimes(1);
    expect(db.auditoriaReportePregunta.create).toHaveBeenCalledTimes(1);
    expect(db.operacionReportePregunta.create).toHaveBeenCalledTimes(1);
    expect(db.tasaReportePregunta.upsert).toHaveBeenCalledTimes(2);
  });
  it.each([
    { detalle: 'Ahora otro texto' },
    { preguntaId: 'another' },
    { motivo: 'RESPUESTA_INCORRECTA' },
  ])('rejects operation reuse with altered payload %p', async (extra) => {
    const { service } = setup();
    await service.create(actor, input());
    await expect(
      service.create(actor, {
        ...input(),
        ...extra,
      } as CreateQuestionReportDto),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('never reveals a foreign operation, even on an otherwise known question', async () => {
    const { receipts, service } = setup();
    receipts.set(operationId, { actorId: 'foreign' });
    await expect(service.create(actor, input())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('a second UUID deduplicates a closed report, records its receipt and never overwrites detail', async () => {
    const { db, service } = setup();
    db.reportePregunta.findUnique.mockResolvedValue(
      record({ estado: 'RESUELTO', detalle: 'Texto anterior' }),
    );
    const result: any = await service.create(actor, {
      ...input(),
      operacionId: secondOperation,
    });
    expect(result).toMatchObject({
      duplicado: true,
      estado: 'RESUELTO',
      detalle: 'Texto anterior',
    });
    expect(db.reportePregunta.create).not.toHaveBeenCalled();
    expect(db.reportePregunta.updateMany).not.toHaveBeenCalled();
    expect(db.operacionReportePregunta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: secondOperation,
          reporteId: reportId,
        }),
      }),
    );
    expect(db.reportePregunta.count).not.toHaveBeenCalled();
  });
  it('semantic unique key separates user, version ID and motive', async () => {
    const { db, service } = setup();
    await service.create(actor, input());
    expect(db.reportePregunta.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          autorId_preguntaId_motivo: {
            autorId: actor,
            preguntaId: 'question-legacy-id',
            motivo: 'IMAGEN_NO_CARGA',
          },
        },
      }),
    );
  });
  it('twenty new reports block new creation but not a known receipt or semantic duplicate', async () => {
    const { db, service } = setup();
    db.reportePregunta.count.mockResolvedValue(20);
    await expect(service.create(actor, input())).rejects.toMatchObject({
      status: 429,
    });
    expect(db.reportePregunta.create).not.toHaveBeenCalled();
    db.reportePregunta.findUnique.mockResolvedValue(record());
    await expect(
      service.create(actor, { ...input(), operacionId: secondOperation }),
    ).resolves.toMatchObject({ duplicado: true });
  });
  it('quota uses server time in a rolling 24h range', async () => {
    const { db, service } = setup();
    await service.create(actor, input());
    const cutoff = db.reportePregunta.count.mock.calls[0][0].where;
    expect(cutoff.autorId).toBe(actor);
    expect(
      Math.abs(Date.now() - cutoff.fechaCreacion.gt.getTime() - 86400000),
    ).toBeLessThan(2000);
  });
  it('database rate limit blocks repeated replays and exposes wait, not user data', async () => {
    const { db, service } = setup();
    db.tasaReportePregunta.findUnique.mockResolvedValue({
      inicio: new Date(),
      solicitudes: 20,
    });
    await expect(service.create(actor, input())).rejects.toMatchObject({
      response: {
        code: 'REPORT_RATE_LIMIT',
        retryAfterSeconds: expect.any(Number),
      },
    });
    expect(db.reportePregunta.findUnique).not.toHaveBeenCalled();
  });
  it('a previous window resets, an active one increments under the user lock', async () => {
    const { db, service } = setup();
    db.tasaReportePregunta.findUnique.mockResolvedValue({
      inicio: new Date(Date.now() - 61000),
      solicitudes: 20,
    });
    await service.create(actor, input());
    expect(
      db.tasaReportePregunta.upsert.mock.calls[0][0].update.solicitudes,
    ).toBe(1);
    db.tasaReportePregunta.findUnique.mockResolvedValue({
      inicio: new Date(),
      solicitudes: 2,
    });
    await service.create(actor, input());
    expect(db.tasaReportePregunta.upsert.mock.calls[1][0].update).toEqual({
      solicitudes: 3,
    });
    expect(db.$queryRaw).toHaveBeenCalled();
  });
  it('oversized legacy content is explicitly incomplete rather than falsely exact', async () => {
    const { db, service } = setup();
    const question = await db.pregunta.findUnique();
    db.pregunta.findUnique.mockResolvedValue({
      ...question,
      enunciado: 'x'.repeat(600000),
    });
    await service.create(actor, input());
    expect(
      db.reportePregunta.create.mock.calls[0][0].data.snapshot,
    ).toMatchObject({
      contenidoOmitido: true,
      historicoExacto: false,
      motivoOmision: 'LIMITE_LEGADO',
    });
  });
  it('serialization conflicts retry a bounded transaction without new business writes', async () => {
    const { db, service } = setup();
    const error = new Prisma.PrismaClientKnownRequestError('retry', {
      code: 'P2034',
      clientVersion: '5',
    });
    db.$transaction.mockRejectedValueOnce(error);
    await expect(service.create(actor, input())).resolves.toMatchObject({
      duplicado: false,
    });
    expect(db.$transaction).toHaveBeenCalledTimes(3);
    expect(db.reportePregunta.create).toHaveBeenCalledTimes(1);
  });
  it('after three unique/serialization conflicts it fails closed', async () => {
    const { db, service } = setup();
    db.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('retry', {
        code: 'P2002',
        clientVersion: '5',
      }),
    );
    await expect(service.create(actor, input())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
  it('unexpected database errors are not converted into successful receipts', async () => {
    const { db, service } = setup();
    db.reportePregunta.create.mockRejectedValue(new Error('offline'));
    await expect(service.create(actor, input())).rejects.toThrow('offline');
    expect(db.operacionReportePregunta.create).not.toHaveBeenCalled();
  });
  it.each(['40001', '40P01'])(
    'raw PostgreSQL transaction conflict %s retries without duplicate business writes',
    async (sqlState) => {
      const { db, service } = setup();
      db.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('raw query conflict', {
          code: 'P2010',
          clientVersion: '5',
          meta: { code: sqlState },
        }),
      );
      await expect(service.create(actor, input())).resolves.toMatchObject({
        duplicado: false,
      });
      expect(db.$transaction).toHaveBeenCalledTimes(3);
      expect(db.reportePregunta.create).toHaveBeenCalledTimes(1);
      expect(db.auditoriaReportePregunta.create).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['40001', '40P01'])(
    'raw PostgreSQL conflict %s is bounded to three attempts and then 409',
    async (sqlState) => {
      const { db, service } = setup();
      db.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('raw query conflict', {
          code: 'P2010',
          clientVersion: '5',
          meta: { code: sqlState },
        }),
      );
      await expect(service.create(actor, input())).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(db.$transaction).toHaveBeenCalledTimes(3);
      expect(db.reportePregunta.create).not.toHaveBeenCalled();
    },
  );
  it.each(['22012', '42501', '42P01'])(
    'unrelated SQL error %s is not retried or converted into a business conflict',
    async (sqlState) => {
      const { db, service } = setup();
      const error = new Prisma.PrismaClientKnownRequestError(
        'other SQL error',
        {
          code: 'P2010',
          clientVersion: '5',
          meta: { code: sqlState },
        },
      );
      db.$transaction.mockRejectedValue(error);
      await expect(service.create(actor, input())).rejects.toBe(error);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.operacionReportePregunta.create).not.toHaveBeenCalled();
    },
  );
});

describe('question report reads and ADMIN decisions', () => {
  it('receipt lookup is actor- and type-scoped; unrelated or missing returns 404', async () => {
    const { db, service } = setup();
    await expect(service.ownReceipt(actor, operationId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.operacionReportePregunta.findFirst).toHaveBeenCalledWith({
      where: { id: operationId, actorId: actor, tipo: 'CREAR' },
      select: { resultado: true },
    });
    db.operacionReportePregunta.findFirst.mockResolvedValue({
      resultado: { id: reportId },
    });
    await expect(service.ownReceipt(actor, operationId)).resolves.toEqual({
      id: reportId,
    });
  });
  it('own list is bounded, stable, private and carries current state', async () => {
    const { db, service } = setup();
    db.reportePregunta.findMany.mockResolvedValue([
      record({ estado: 'RESUELTO' }),
      record({ id: 'next' }),
    ]);
    const result = await service.own(actor, { pagina: 2, limite: 1 });
    expect(result.hayMas).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ estado: 'RESUELTO' });
    expect(result.items[0]).not.toHaveProperty('snapshot');
    expect(result.items[0]).not.toHaveProperty('autorId');
    expect(db.reportePregunta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { autorId: actor }, take: 2, skip: 1 }),
    );
    const selected = db.reportePregunta.findMany.mock.calls[0][0].select;
    expect(selected).not.toHaveProperty('snapshot');
    expect(selected).not.toHaveProperty('autorId');
  });
  it.each(['ESTUDIANTE', 'PROFESOR'])(
    'rejects moderation and detail from %s',
    async (rol) => {
      const { db, service } = setup();
      db.usuario.findUnique.mockResolvedValue({ rol, correoVerificado: true });
      await expect(service.detail(actor, reportId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.list(actor, { pagina: 1, limite: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.reportePregunta.findMany).not.toHaveBeenCalled();
    },
  );
  it('ADMIN details contain authorized snapshot/audit, not operations or email', async () => {
    const { db, service } = setup();
    db.usuario.findUnique.mockResolvedValue({ rol: 'ADMIN' });
    db.reportePregunta.findUnique.mockResolvedValue(
      record({ auditorias: [{ revision: 0 }] }),
    );
    const result = await service.detail(actor, reportId);
    expect(result.snapshot).toEqual({ secreto: 'solo admin' });
    expect(result.auditoria).toEqual([{ revision: 0 }]);
    expect(result).not.toHaveProperty('autorId');
    expect(result).not.toHaveProperty('operaciones');
  });
  it('filters are applied to captured classification and rejects area/subtopic mismatch', async () => {
    const { db, service } = setup();
    db.usuario.findUnique.mockResolvedValue({ rol: 'ADMIN' });
    const query: AdminQuestionReportQuery = {
      pagina: 1,
      limite: 20,
      area: 'INGLES',
      subtemaId: 's',
      estado: 'PENDIENTE',
      motivo: 'OTRO',
    };
    await service.list(actor, query);
    expect(db.reportePregunta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          areaCapturada: 'INGLES',
          subtemaIdCapturado: 's',
          estado: 'PENDIENTE',
          motivo: 'OTRO',
        },
      }),
    );
    db.subtema.findFirst.mockResolvedValue(null);
    await expect(service.list(actor, query)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  const decision = (): ReviewQuestionReportDto => ({
    operacionId: operationId,
    revision: 0,
    destino: 'EN_REVISION',
    motivoRevision: ' Comprobación inicial ',
  });
  function reviewing() {
    const x = setup();
    x.db.usuario.findUnique.mockResolvedValue({ rol: 'ADMIN' });
    x.db.reportePregunta.findUnique.mockResolvedValue(record());
    return x;
  }
  it('decision updates only expected revision, records audit and a stable receipt', async () => {
    const { db, service } = reviewing();
    const first = await service.review(actor, reportId, decision());
    expect(db.reportePregunta.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reportId, revision: 0, estado: 'PENDIENTE' },
      }),
    );
    expect(db.auditoriaReportePregunta.create).toHaveBeenCalledWith({
      data: {
        reporteId: reportId,
        actorId: actor,
        estadoAnterior: 'PENDIENTE',
        estadoNuevo: 'EN_REVISION',
        revision: 1,
        motivoRevision: 'Comprobación inicial',
      },
    });
    expect(await service.review(actor, reportId, decision())).toEqual(first);
    expect(db.reportePregunta.updateMany).toHaveBeenCalledTimes(1);
    expect(db.auditoriaReportePregunta.create).toHaveBeenCalledTimes(1);
  });
  it('stale revision or concurrent update cannot overwrite another ADMIN', async () => {
    const { db, service } = reviewing();
    await expect(
      service.review(actor, reportId, { ...decision(), revision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    db.reportePregunta.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.review(actor, reportId, decision()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.auditoriaReportePregunta.create).not.toHaveBeenCalled();
    expect(db.operacionReportePregunta.create).not.toHaveBeenCalled();
  });
  it('a reused decision UUID with another decision is not a silent overwrite', async () => {
    const { service } = reviewing();
    await service.review(actor, reportId, decision());
    await expect(
      service.review(actor, reportId, {
        ...decision(),
        motivoRevision: 'otro',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('missing report fails without an audit or receipt', async () => {
    const { db, service } = reviewing();
    db.reportePregunta.findUnique.mockResolvedValue(null);
    await expect(
      service.review(actor, reportId, decision()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.auditoriaReportePregunta.create).not.toHaveBeenCalled();
  });
  it('only a new, explicit reviewed reopening changes a closed record', async () => {
    const { db, service } = reviewing();
    db.reportePregunta.findUnique.mockResolvedValue(
      record({ estado: 'DESCARTADO', revision: 3 }),
    );
    db.reportePregunta.findUniqueOrThrow.mockResolvedValue(
      record({ estado: 'EN_REVISION', revision: 4 }),
    );
    await expect(
      service.review(actor, reportId, { ...decision(), revision: 3 }),
    ).resolves.toMatchObject({ revision: 4 });
    expect(
      db.auditoriaReportePregunta.create.mock.calls[0][0].data.estadoAnterior,
    ).toBe('DESCARTADO');
  });
});

describe('report DTO, policy, transport and privacy contract', () => {
  it('database failures return an uncertain safe response, never private Prisma invocation values', () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn(),
      json: jest.fn(),
    };
    response.status.mockReturnValue(response);
    const host = { switchToHttp: () => ({ getResponse: () => response }) };
    new QuestionReportStorageFilter().catch(
      new Error('PRIVATE_TOKEN_AND_REPORT_TEXT'),
      host as unknown as ArgumentsHost,
    );
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    const result = response.json.mock.calls[0][0];
    expect(result.code).toBe('REPORT_STORAGE_UNAVAILABLE');
    expect(JSON.stringify(result)).not.toContain(
      'PRIVATE_TOKEN_AND_REPORT_TEXT',
    );
  });
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const validate = (
    value: object,
    metatype: any = CreateQuestionReportDto,
    type: 'body' | 'query' = 'body',
  ) => pipe.transform(value, { type, metatype });
  it('keeps report endpoints authenticated, verified and independent of paid plan', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QuestionReportController),
    ).toEqual([JwtGuard, EmailVerificadoGuard]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminQuestionReportController),
    ).toEqual([AdminGuard]);
    for (const [controller, methods] of [
      [QuestionReportController, ['create', 'receipt', 'own']],
      [AdminQuestionReportController, ['list', 'detail', 'review']],
    ] as const) {
      for (const method of methods)
        expect(
          Reflect.getMetadata(HEADERS_METADATA, controller.prototype[method]),
        ).toContainEqual({ name: 'Cache-Control', value: 'private, no-store' });
    }
  });
  it.each([
    { usuarioId: actor },
    { rol: 'ADMIN' },
    { estado: 'RESUELTO' },
    { snapshot: {} },
    { operacionId: 'not-uuid' },
    { preguntaId: 123 },
    { preguntaId: '' },
    { preguntaId: 'x\n' },
    { motivo: 'UNKNOWN' },
    { detalle: {} },
    { detalle: [] },
    { detalle: 123 },
    { detalle: null },
    { detalle: 'x'.repeat(501) },
    { detalle: 'x\u0000' },
  ])(
    'rejects malformed, coerced or unrecognized creation fields %p',
    async (invalid) => {
      await expect(validate({ ...input(), ...invalid })).rejects.toThrow();
    },
  );
  it('accepts 500 Unicode code points, not 500 UTF16 halves', async () => {
    await expect(
      validate({ ...input(), detalle: '😀'.repeat(500) }),
    ).resolves.toMatchObject({ detalle: '😀'.repeat(500) });
    await expect(
      validate({ ...input(), detalle: '😀'.repeat(501) }),
    ).rejects.toThrow();
    await expect(
      validate({
        operacionId: operationId,
        preguntaId: 'legacy',
        motivo: 'IMAGEN_NO_CARGA',
      }),
    ).resolves.toMatchObject({ preguntaId: 'legacy' });
  });
  it('OTRO requires a normalized description', () => {
    expect(() => validateReportDetail('OTRO', '')).toThrow();
    expect(() => validateReportDetail('OTRO', '😀'.repeat(10))).not.toThrow();
  });
  it('rejects isolated Unicode surrogates instead of changing the payload in storage', async () => {
    await expect(validate({ ...input(), detalle: '\ud800' })).rejects.toThrow();
    await expect(validate({ ...input(), detalle: '\udfff' })).rejects.toThrow();
  });
  it.each([
    { revision: '0' },
    { revision: -1 },
    { revision: 2147483647 },
    { motivoRevision: ' ' },
    { motivoRevision: null },
    { motivoRevision: false },
    { destino: 'UNKNOWN' },
  ])('rejects invalid admin decisions %p', async (invalid) => {
    await expect(
      validate(
        {
          operacionId: operationId,
          revision: 0,
          destino: 'EN_REVISION',
          motivoRevision: 'Revisión',
          ...invalid,
        },
        ReviewQuestionReportDto,
      ),
    ).rejects.toThrow();
  });
  it('pagination is bounded and unrecognized filters are rejected', async () => {
    await expect(
      validate({ pagina: '2', limite: '20' }, QuestionReportPageDto, 'query'),
    ).resolves.toMatchObject({ pagina: 2, limite: 20 });
    for (const value of [
      { pagina: 10001 },
      { limite: 51 },
      { estado: 'UNKNOWN' },
      { area: 'UNKNOWN' },
      { autorId: actor },
      { subtemaId: '' },
    ]) {
      await expect(
        validate(value, AdminQuestionReportQuery, 'query'),
      ).rejects.toThrow();
    }
  });
  it('fingerprint includes account, operation kind and payload, not the operation UUID', () => {
    expect(reportFingerprint(actor, 'CREAR', { a: 1 })).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(reportFingerprint(actor, 'CREAR', { a: 1 })).not.toBe(
      reportFingerprint('other', 'CREAR', { a: 1 }),
    );
    expect(reportFingerprint(actor, 'CREAR', { a: 1 })).not.toBe(
      reportFingerprint(actor, 'DECIDIR', { a: 1 }),
    );
  });
  const states = Object.values(State);
  for (const from of states)
    for (const to of states) {
      const permitted =
        (from === 'PENDIENTE' && to === 'EN_REVISION') ||
        (from === 'EN_REVISION' && ['RESUELTO', 'DESCARTADO'].includes(to)) ||
        (['RESUELTO', 'DESCARTADO'].includes(from) && to === 'EN_REVISION');
      it(`${from} → ${to} is ${permitted ? 'allowed' : 'rejected'}`, () => {
        const action = () => requireReportTransition(from, to);
        if (permitted) expect(action).not.toThrow();
        else expect(action).toThrow(ConflictException);
      });
    }
  it('IP envelope skips reads; per-account rate is separate and durable', () => {
    expect(reportIpOptions.max).toBe(100);
    expect(reportIpOptions.windowMs).toBe(60000);
    expect(reportIpOptions.skip({ method: 'GET' })).toBe(true);
    expect(reportIpOptions.skip({ method: 'POST' })).toBe(false);
    expect(reportIpOptions.skip({ method: 'PATCH' })).toBe(false);
  });
});
