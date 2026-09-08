import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from '../auth/jwt.guard';
import { QuestionReclassificationService } from './question-reclassification.service';
import { QuestionReclassificationController } from './question-reclassification.controller';
import {
  ApplyReclassificationDto,
  ReclassificationDestinationDto,
  ReclassificationParams,
} from './question-reclassification.dto';

const parent = (id: string, temaId: string, nombre: string) => ({
  id,
  temaId,
  nombre,
  estadoContenido: 'BORRADOR',
  tema: {
    id: temaId,
    nombre: 'Proporcionalidad',
    area: 'MATEMATICAS',
    estadoContenido: 'BORRADOR',
  },
});
const fixture = () => ({
  id: 'q1',
  subtemaId: 's1',
  estadoContenido: 'ARCHIVADO',
  fechaPublicacion: null as Date | null,
  fechaActualizacion: new Date('2026-01-01'),
  subtema: parent('s1', 't1', 'Banco General'),
  enunciado: '¿Cuánto es 2 + 2?',
  explicacion: 'Sumamos las cantidades.',
  porcentajeAciertos: 0,
  tiempoPromedioSegundos: 0,
  huellaContenido: 'a'.repeat(64),
  casoId: 'c1',
  ordenEnCaso: 1,
  caso: { id: 'c1', area: 'MATEMATICAS' },
  respuestas: [
    { id: 'r1', texto: '4', esCorrecta: true },
    { id: 'r2', texto: '5', esCorrecta: false },
  ],
  _count: {
    respuestas: 2,
    historialRespuestas: 0,
    cuadernoErrores: 0,
    preguntasBatalla: 0,
    preguntasTiraAfloja: 0,
    preguntasTriviaRush: 0,
  } as Record<string, number>,
});

describe('QuestionReclassificationService', () => {
  let question = fixture();
  let destination = parent('s2', 't2', 'Regla de tres');
  let guardianPresent = false,
    guardianUsed = false;
  const tx = {
    pregunta: { findUnique: jest.fn(), update: jest.fn() },
    subtema: { findUnique: jest.fn(), update: jest.fn() },
    diagnosticoInicial: { findFirst: jest.fn() },
    intentoSimulacro: { findFirst: jest.fn() },
    $queryRaw: jest.fn<
      Promise<unknown[]>,
      [TemplateStringsArray, ...unknown[]]
    >(),
  };
  const prisma = { ...tx, $transaction: jest.fn() };
  const service = new QuestionReclassificationService(
    prisma as unknown as PrismaService,
  );
  const previousGate = process.env.EDITORIAL_RECLASSIFICATION_ENABLED;
  beforeEach(() => {
    jest.resetAllMocks();
    question = fixture();
    destination = parent('s2', 't2', 'Regla de tres');
    guardianPresent = false;
    guardianUsed = false;
    delete process.env.EDITORIAL_RECLASSIFICATION_ENABLED;
    tx.pregunta.findUnique.mockImplementation(() =>
      Promise.resolve(structuredClone(question)),
    );
    tx.subtema.findUnique.mockImplementation(() =>
      Promise.resolve(structuredClone(destination)),
    );
    tx.diagnosticoInicial.findFirst.mockResolvedValue(null);
    tx.intentoSimulacro.findFirst.mockResolvedValue(null);
    tx.$queryRaw.mockImplementation((sql) => {
      const text = sql.join('?');
      if (text.includes('to_regclass'))
        return Promise.resolve([{ presente: guardianPresent }]);
      if (text.includes('FROM "IntentoGuardian"'))
        return Promise.resolve(guardianUsed ? [{ id: 'private-attempt' }] : []);
      return Promise.resolve([]);
    });
    tx.pregunta.update.mockImplementation(
      ({ data }: { data: { subtemaId: string } }) => {
        question.subtemaId = data.subtemaId;
        question.subtema = structuredClone(destination);
        return Promise.resolve({
          id: question.id,
          subtemaId: question.subtemaId,
          estadoContenido: question.estadoContenido,
          fechaActualizacion: new Date('2026-09-07'),
        });
      },
    );
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
  });
  afterEach(() => {
    expect(tx.subtema.update).not.toHaveBeenCalled();
    if (previousGate === undefined)
      delete process.env.EDITORIAL_RECLASSIFICATION_ENABLED;
    else process.env.EDITORIAL_RECLASSIFICATION_ENABLED = previousGate;
  });
  const preview = () => service.preview('q1', 's2');
  const apply = async () =>
    service.apply('q1', {
      destinoSubtemaId: 's2',
      revision: (await preview()).revision,
      confirmado: true,
    });

  it('previews the selected destination and content, with no mutation or automatic classification', async () => {
    const result = await preview();
    expect(result).toMatchObject({
      habilitado: false,
      puedeReclasificar: false,
      bloqueos: [],
      origen: { subtemaId: 's1', generico: true },
      destino: { subtemaId: 's2' },
    });
    expect(result.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty('uso');
    expect(result).not.toHaveProperty('_count');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it.each([undefined, 'false', 'TRUE', '1'])(
    'does not enable writes for %s',
    async (gate) => {
      if (gate !== undefined)
        process.env.EDITORIAL_RECLASSIFICATION_ENABLED = gate;
      await expect(apply()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each(['BORRADOR', 'ARCHIVADO'])(
    'moves an unused %s question without changing state, answers, case or fingerprint',
    async (state) => {
      process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
      question.estadoContenido = state;
      const original = structuredClone(question);
      const result = await apply();
      expect(result).toMatchObject({
        pregunta: { id: 'q1', subtemaId: 's2', estadoContenido: state },
        origenSubtemaId: 's1',
      });
      expect(tx.pregunta.update).toHaveBeenCalledTimes(1);
      expect(tx.pregunta.update).toHaveBeenCalledWith({
        where: { id: 'q1' },
        data: { subtemaId: 's2' },
        select: {
          id: true,
          subtemaId: true,
          estadoContenido: true,
          fechaActualizacion: true,
        },
      });
      expect(question).toEqual({
        ...original,
        subtemaId: 's2',
        subtema: destination,
      });
      const lockingCalls = tx.$queryRaw.mock.calls.filter(
        ([sql]) => !sql.join('').includes('to_regclass'),
      );
      expect(lockingCalls.map(([, value]) => value)).toEqual([
        'editor:area:MATEMATICAS',
        't1',
        't2',
        's1',
        's2',
        'q1',
        'c1',
      ]);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        maxWait: 5000,
        timeout: 15000,
      });
    },
  );
  it.each(['EN_REVISION', 'PUBLICADO'])('blocks state %s', async (state) => {
    process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
    question.estadoContenido = state;
    await expect(apply()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it('does not move archived content that was previously published', async () => {
    process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
    question.fechaPublicacion = new Date('2025-01-01');
    await expect(apply()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it.each([
    'historialRespuestas',
    'cuadernoErrores',
    'preguntasBatalla',
    'preguntasTiraAfloja',
    'preguntasTriviaRush',
    'nuevaRelacionAcademica',
  ])(
    'blocks academic relation %s, including future relations',
    async (relation) => {
      process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
      question._count[relation] = 1;
      expect((await preview()).bloqueos.join(' ')).toContain('uso académico');
      await expect(apply()).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.pregunta.update).not.toHaveBeenCalled();
    },
  );
  it.each(['porcentajeAciertos', 'tiempoPromedioSegundos'] as const)(
    'blocks retained statistic %s even without remaining response rows',
    async (key) => {
      process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
      question[key] = 1;
      await expect(apply()).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.pregunta.update).not.toHaveBeenCalled();
    },
  );
  it.each(['diagnosticoInicial', 'intentoSimulacro'] as const)(
    'checks JSON references in %s, not only relations or active attempts',
    async (table) => {
      process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
      tx[table].findFirst.mockResolvedValue({ id: 'private-attempt' });
      await expect(apply()).rejects.toBeInstanceOf(BadRequestException);
      expect(tx[table].findFirst).toHaveBeenCalledWith({
        where: { preguntaIds: { array_contains: ['q1'] } },
        select: { id: true },
      });
      expect(JSON.stringify(await preview())).not.toContain('private-attempt');
      expect(tx.pregunta.update).not.toHaveBeenCalled();
    },
  );
  it('checks existing Guardian snapshots without changing or requiring that optional migration', async () => {
    process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
    guardianPresent = true;
    guardianUsed = true;
    await expect(apply()).rejects.toBeInstanceOf(BadRequestException);
    const query = tx.$queryRaw.mock.calls.find(([sql]) =>
      sql.join('').includes('FROM "IntentoGuardian"'),
    );
    expect(query?.[1]).toBe(JSON.stringify([{ question: { id: 'q1' } }]));
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it('fails closed when it cannot determine whether optional academic storage exists', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(preview()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it('does not treat database permission failures as absence of academic use', async () => {
    process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
    const detail = await preview();
    tx.intentoSimulacro.findFirst.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(
      service.apply('q1', {
        destinoSubtemaId: 's2',
        revision: detail.revision,
        confirmado: true,
      }),
    ).rejects.toThrow('database unavailable');
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it.each([
    'genericSubtheme',
    'genericTheme',
    'archivedSubtheme',
    'archivedTheme',
    'sameSubtheme',
    'foreignArea',
    'foreignCase',
  ])('blocks invalid destination or case: %s', async (reason) => {
    process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
    if (reason === 'genericSubtheme') destination.nombre = 'Banco General';
    if (reason === 'genericTheme') destination.tema.nombre = 'Banco General';
    if (reason === 'archivedSubtheme')
      destination.estadoContenido = 'ARCHIVADO';
    if (reason === 'archivedTheme')
      destination.tema.estadoContenido = 'ARCHIVADO';
    if (reason === 'sameSubtheme') question.subtemaId = 's2';
    if (reason === 'foreignArea') destination.tema.area = 'INGLES';
    if (reason === 'foreignCase') question.caso.area = 'INGLES';
    expect((await preview()).bloqueos.length).toBeGreaterThan(0);
    await expect(apply()).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.pregunta.update).not.toHaveBeenCalled();
    if (reason === 'foreignArea')
      expect(
        tx.$queryRaw.mock.calls.some(([sql]) =>
          sql.join('').includes('FOR UPDATE'),
        ),
      ).toBe(false);
  });
  it.each(['question', 'destination', 'usage'])(
    'rejects stale %s after acquiring locks',
    async (change) => {
      process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
      const detail = await preview();
      const original = tx.$queryRaw.getMockImplementation();
      tx.$queryRaw.mockImplementation((sql, ...values) => {
        if (sql.join('').includes('pg_advisory_xact_lock')) {
          if (change === 'question') question.enunciado = 'Otro contenido';
          if (change === 'destination') destination.nombre = 'Otro destino';
          if (change === 'usage')
            tx.intentoSimulacro.findFirst.mockResolvedValue({
              id: 'private-attempt',
            });
        }
        return original(sql, ...values);
      });
      await expect(
        service.apply('q1', {
          destinoSubtemaId: 's2',
          revision: detail.revision,
          confirmado: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.pregunta.update).not.toHaveBeenCalled();
    },
  );
  it('does not apply a reviewed destination to a different destination or repeat a completed move', async () => {
    process.env.EDITORIAL_RECLASSIFICATION_ENABLED = 'true';
    const detail = await preview();
    destination.id = 's3';
    await expect(
      service.apply('q1', {
        destinoSubtemaId: 's3',
        revision: detail.revision,
        confirmado: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    destination.id = 's2';
    const command = {
      destinoSubtemaId: 's2',
      revision: detail.revision,
      confirmado: true,
    };
    await service.apply('q1', command);
    await expect(service.apply('q1', command)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.pregunta.update).toHaveBeenCalledTimes(1);
  });
  it.each(['pregunta', 'subtema'] as const)(
    'reports missing %s without writing',
    async (table) => {
      tx[table].findUnique.mockResolvedValue(null);
      await expect(preview()).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.pregunta.update).not.toHaveBeenCalled();
    },
  );
});

describe('reclassification ADMIN input contract', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  it('requires ADMIN on both routes', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QuestionReclassificationController),
    ).toEqual([AdminGuard]);
  });
  it.each([false, 'false', 'true', 1, undefined])(
    'does not treat %j as explicit approval',
    async (confirmado) => {
      await expect(
        pipe.transform(
          { destinoSubtemaId: 's2', revision: 'a'.repeat(64), confirmado },
          { type: 'body', metatype: ApplyReclassificationDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('accepts an explicitly confirmed reviewed destination', async () => {
    await expect(
      pipe.transform(
        { destinoSubtemaId: 's2', revision: 'a'.repeat(64), confirmado: true },
        { type: 'body', metatype: ApplyReclassificationDto },
      ),
    ).resolves.toMatchObject({ confirmado: true });
  });
  it.each([
    {},
    { destinoSubtemaId: '' },
    { destinoSubtemaId: 'x'.repeat(121) },
    { destinoSubtemaId: 's2', subtemaId: 's1' },
  ])('rejects missing/unbounded/arbitrary destinations: %j', async (body) => {
    await expect(
      pipe.transform(body, {
        type: 'query',
        metatype: ReclassificationDestinationDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects malformed revisions and oversized identifiers', async () => {
    await expect(
      pipe.transform(
        { destinoSubtemaId: 's2', revision: 'old', confirmado: true },
        { type: 'body', metatype: ApplyReclassificationDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { id: 'x'.repeat(121) },
        { type: 'param', metatype: ReclassificationParams },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
