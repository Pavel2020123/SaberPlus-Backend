/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers return any inside nested assertion objects. */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from '../auth/jwt.guard';
import { createQuestionFingerprint } from '../common/question-fingerprint';
import { QuestionEditorService } from './question-editor.service';
import { QuestionEditorController } from './question-editor.controller';
import { EditorialCaseDto, EditorialQuestionDto } from './question-editor.dto';

describe('QuestionEditorService', () => {
  const body = (): EditorialQuestionDto => ({
    subtemaId: 's1',
    enunciado: '¿Cuánto es 2 + 2?',
    explicacion: 'Sumamos dos y dos: cuatro.',
    dificultad: 'BASICO',
    imagenUrl: '',
    casoId: '',
    respuestas: [
      { texto: '4', esCorrecta: true, explicacion: 'Es la suma.' },
      { texto: '5', esCorrecta: false, explicacion: '' },
    ],
  });
  const parent = () => ({
    id: 's1',
    nombre: 'Sumas',
    temaId: 't1',
    estadoContenido: 'PUBLICADO',
    tema: {
      id: 't1',
      nombre: 'Aritmética',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO',
    },
  });
  const fixture = () => ({
    ...body(),
    id: 'q1',
    casoId: null as string | null,
    caso: null,
    ordenEnCaso: null,
    subtema: parent(),
    estadoContenido: 'BORRADOR',
    fechaPublicacion: null as Date | null,
    _count: {
      respuestas: 2,
      historialRespuestas: 0,
      preguntasBatalla: 0,
      preguntasTiraAfloja: 0,
      preguntasTriviaRush: 0,
      cuadernoErrores: 0,
    },
  });
  const caseFixture = () => ({
    id: 'c1',
    titulo: 'Compras',
    contexto: 'Cuatro cuadernos.',
    imagenUrl: '',
    area: 'MATEMATICAS',
    estadoContenido: 'BORRADOR',
    fechaPublicacion: null as Date | null,
    _count: { preguntas: 0 },
  });
  let row = fixture(),
    sub = parent(),
    caso = caseFixture();
  const tx = {
    $queryRaw: jest.fn(),
    subtema: { findUnique: jest.fn() },
    pregunta: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    casoPregunta: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = { ...tx, $transaction: jest.fn() };
  const service = new QuestionEditorService(prisma as unknown as PrismaService);
  beforeEach(() => {
    jest.resetAllMocks();
    row = fixture();
    sub = parent();
    caso = caseFixture();
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => unknown) => fn(tx),
    );
    tx.subtema.findUnique.mockImplementation(() => Promise.resolve(sub));
    tx.pregunta.findUnique.mockImplementation(() => Promise.resolve(row));
    tx.pregunta.findMany.mockResolvedValue([]);
    tx.pregunta.findFirst.mockResolvedValue(null);
    tx.pregunta.create.mockResolvedValue(row);
    tx.pregunta.update.mockResolvedValue(row);
    tx.casoPregunta.findUnique.mockImplementation(() => Promise.resolve(caso));
    tx.casoPregunta.findMany.mockResolvedValue([]);
    tx.casoPregunta.create.mockResolvedValue(caso);
    tx.casoPregunta.update.mockResolvedValue(caso);
  });
  it('crea un borrador bajo bloqueo, con opciones y huella, sin publicar', async () => {
    const result = await service.guardarPregunta(body());
    expect(result.editable).toBe(true); // Answers themselves must not count as academic usage.
    expect(tx.pregunta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtemaId: 's1',
          estadoContenido: 'BORRADOR',
          huellaContenido: expect.stringMatching(/^[a-f0-9]{64}$/),
          respuestas: {
            create: expect.arrayContaining([
              expect.objectContaining({ texto: '4', esCorrecta: true }),
            ]),
          },
        }),
      }),
    );
    expect(tx.$queryRaw.mock.invocationCallOrder[2]).toBeLessThan(
      tx.pregunta.create.mock.invocationCallOrder[0],
    );
  });
  it.each([
    'correctas',
    'repetidas',
    'cantidad',
    'explicacion',
    'imagen',
    'orden',
  ])('rechaza datos inválidos: %s', async (reason) => {
    const input = body();
    if (reason === 'correctas') input.respuestas[1].esCorrecta = true;
    if (reason === 'repetidas') input.respuestas[1].texto = ' 4 ';
    if (reason === 'cantidad') input.respuestas = [];
    if (reason === 'explicacion') input.explicacion = '  ';
    if (reason === 'imagen') input.imagenUrl = 'javascript:alert(1)';
    if (reason === 'orden') input.ordenEnCaso = 1;
    await expect(service.guardarPregunta(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.pregunta.create).not.toHaveBeenCalled();
  });
  it.each(['ARCHIVADO', 'PUBLICADO', 'BORRADOR'])(
    'detecta duplicados incluso %s y con opciones reordenadas',
    async (estado) => {
      const input = body();
      input.respuestas.reverse();
      tx.pregunta.findMany.mockResolvedValue([
        {
          ...fixture(),
          estadoContenido: estado,
          huellaContenido: createQuestionFingerprint({
            area: 'MATEMATICAS',
            enunciado: body().enunciado,
            opciones: body().respuestas,
          }),
        },
      ]);
      await expect(service.guardarPregunta(input)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'DUPLICATE_QUESTION',
          duplicate: expect.objectContaining({ id: 'q1' }),
        }),
      });
      expect(tx.pregunta.create).not.toHaveBeenCalled();
    },
  );
  it('calcula la huella de preguntas heredadas sin índice', async () => {
    tx.pregunta.findMany.mockResolvedValue([
      { ...fixture(), huellaContenido: null },
    ]);
    await expect(service.guardarPregunta(body())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('falla cerrado si supera el límite de preguntas heredadas por comparar', async () => {
    tx.pregunta.findMany.mockResolvedValue(
      Array.from({ length: 2001 }, () => fixture()),
    );
    await expect(service.guardarPregunta(body())).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LEGACY_INDEX_REQUIRED' }),
    });
  });
  it('el editor conserva revisión y rechaza cambios concurrentes', async () => {
    const original = await service.detallePregunta('q1');
    row.enunciado = 'Cambió';
    await expect(
      service.guardarPregunta({ ...body(), revision: original.revision }, 'q1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EDITOR_STALE' }),
    });
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it.each([
    'PUBLICADO',
    'EN_REVISION',
    'ARCHIVADO',
    'historial',
    'juego',
    'publicadoAntes',
  ])('no edita contenido con %s', async (reason) => {
    if (reason === 'historial') row._count.historialRespuestas = 1;
    else if (reason === 'juego') row._count.preguntasTriviaRush = 1;
    else if (reason === 'publicadoAntes') row.fechaPublicacion = new Date();
    else row.estadoContenido = reason;
    const detail = await service.detallePregunta('q1');
    expect(detail.editable).toBe(false);
    await expect(
      service.guardarPregunta({ ...body(), revision: detail.revision }, 'q1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('actualiza opciones solo en borrador sin referencias y excluye su propia huella', async () => {
    const detail = await service.detallePregunta('q1');
    await service.guardarPregunta(
      { ...body(), revision: detail.revision },
      'q1',
    );
    expect(tx.pregunta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'q1' } }),
      }),
    );
    expect(tx.pregunta.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          respuestas: expect.objectContaining({ deleteMany: {} }),
        }),
      }),
    );
  });
  it('valida el subtema después del bloqueo', async () => {
    tx.$queryRaw.mockImplementation(() => {
      sub.estadoContenido = 'ARCHIVADO';
      return Promise.resolve([]);
    });
    await expect(service.guardarPregunta(body())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
  it.each(['otraArea', 'archivado', 'ordenOcupado'])(
    'valida casos: %s',
    async (reason) => {
      if (reason === 'otraArea') caso.area = 'INGLES';
      if (reason === 'archivado') caso.estadoContenido = 'ARCHIVADO';
      if (reason === 'ordenOcupado')
        tx.pregunta.findFirst.mockResolvedValue({ id: 'other' });
      await expect(
        service.guardarPregunta({ ...body(), casoId: 'c1', ordenEnCaso: 1 }),
      ).rejects.toBeInstanceOf(
        reason === 'ordenOcupado' ? ConflictException : BadRequestException,
      );
      expect(tx.pregunta.create).not.toHaveBeenCalled();
    },
  );
  it('asocia el caso sin cambiar la clasificación', async () => {
    await service.guardarPregunta({ ...body(), casoId: 'c1', ordenEnCaso: 2 });
    expect(tx.pregunta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtemaId: 's1',
          casoId: 'c1',
          ordenEnCaso: 2,
        }),
      }),
    );
  });
  it('crea y edita casos vacíos; bloquea casos ya utilizados', async () => {
    const input: EditorialCaseDto = {
      area: 'MATEMATICAS',
      titulo: 'Compras',
      contexto: 'Un contexto',
      imagenUrl: '',
    };
    await service.guardarCaso(input);
    const detail = await service.detalleCaso('c1');
    await service.guardarCaso({ ...input, revision: detail.revision }, 'c1');
    caso._count.preguntas = 1;
    const used = await service.detalleCaso('c1');
    await expect(
      service.guardarCaso({ ...input, revision: used.revision }, 'c1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.casoPregunta.update).toHaveBeenCalledTimes(1);
  });
  it('devuelve páginas acotadas sin respuestas en el listado', async () => {
    tx.pregunta.findMany.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);
    const page = await service.preguntas('s1', 1, 1);
    expect(page.hayMas).toBe(true);
    expect(page.items).toHaveLength(1);
    expect(tx.pregunta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 2,
        select: {
          id: true,
          subtemaId: true,
          enunciado: true,
          estadoContenido: true,
        },
      }),
    );
  });
  it('requiere ADMIN, DTO completo y registro existente', async () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, QuestionEditorController),
    ).toEqual([AdminGuard]);
    expect(
      validateSync(plainToInstance(EditorialQuestionDto, body())),
    ).toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(EditorialQuestionDto, {
          ...body(),
          respuestas: [],
          dificultad: 'OTRA',
        }),
      ).length,
    ).toBeGreaterThan(0);
    tx.pregunta.findUnique.mockResolvedValue(null);
    await expect(service.detallePregunta('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
