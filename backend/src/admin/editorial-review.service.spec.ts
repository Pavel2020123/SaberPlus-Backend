import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from '../auth/jwt.guard';
import { EditorialReviewService } from './editorial-review.service';
import {
  EditorialReviewController,
  EditorialReviewParams,
  EditorialStateDto,
} from './editorial-review.controller';
import { createQuestionFingerprint } from '../common/question-fingerprint';

describe('EditorialReviewService', () => {
  const previousFlag = process.env.EDITORIAL_PUBLICATION_ENABLED;
  const fixture = () => ({
    id: 'q1',
    subtemaId: 's1',
    enunciado: '¿Cuánto es 2 + 2?',
    explicacion: 'La suma es cuatro.',
    imagenUrl: null,
    casoId: null as string | null,
    caso: null as {
      id: string;
      contexto: string;
      titulo: string;
      area: string;
      estadoContenido: string;
      imagenUrl: string | null;
    } | null,
    ordenEnCaso: null as number | null,
    estadoContenido: 'EN_REVISION',
    fechaPublicacion: null as Date | null,
    respuestas: [
      { id: 'a', texto: '4', esCorrecta: true, explicacion: '' },
      { id: 'b', texto: '5', esCorrecta: false, explicacion: '' },
    ],
    subtema: {
      id: 's1',
      temaId: 't1',
      nombre: 'Sumas',
      estadoContenido: 'PUBLICADO',
      tema: {
        id: 't1',
        nombre: 'Aritmética',
        area: 'MATEMATICAS',
        estadoContenido: 'PUBLICADO',
      },
    },
  });
  let question = fixture();
  let tema = {
    id: 't1',
    nombre: 'Aritmética',
    area: 'MATEMATICAS',
    estadoContenido: 'EN_REVISION',
    fechaPublicacion: null as Date | null,
    _count: { subtemas: 0 },
  };
  let sub = {
    ...question.subtema,
    contenido: '',
    imagenUrl: null,
    videoUrl: null,
    tipoInteractivo: null as string | null,
    datosInteractivo: null as unknown,
    fechaPublicacion: null as Date | null,
    _count: { preguntas: 0 },
  };
  let caso = {
    id: 'c1',
    area: 'MATEMATICAS',
    titulo: 'Un caso',
    contexto: 'Contexto',
    imagenUrl: null,
    estadoContenido: 'EN_REVISION',
    fechaPublicacion: null as Date | null,
    _count: { preguntas: 0 },
  };
  const table = () => ({ findUnique: jest.fn(), update: jest.fn() });
  const tx = {
    $queryRaw: jest.fn(),
    tema: table(),
    subtema: table(),
    casoPregunta: table(),
    pregunta: { ...table(), findMany: jest.fn(), findFirst: jest.fn() },
  };
  const prisma = { ...tx, $transaction: jest.fn() };
  const service = new EditorialReviewService(
    prisma as unknown as PrismaService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EDITORIAL_PUBLICATION_ENABLED = 'true';
    question = fixture();
    tema = {
      id: 't1',
      nombre: 'Aritmética',
      area: 'MATEMATICAS',
      estadoContenido: 'EN_REVISION',
      fechaPublicacion: null,
      _count: { subtemas: 0 },
    };
    sub = {
      ...question.subtema,
      contenido: '',
      imagenUrl: null,
      videoUrl: null,
      tipoInteractivo: null,
      datosInteractivo: null,
      fechaPublicacion: null,
      _count: { preguntas: 0 },
    };
    caso = {
      id: 'c1',
      area: 'MATEMATICAS',
      titulo: 'Un caso',
      contexto: 'Contexto',
      imagenUrl: null,
      estadoContenido: 'EN_REVISION',
      fechaPublicacion: null,
      _count: { preguntas: 0 },
    };
    prisma.$transaction.mockImplementation((fn: (db: typeof tx) => unknown) =>
      fn(tx),
    );
    tx.tema.findUnique.mockImplementation(() => Promise.resolve(tema));
    tx.subtema.findUnique.mockImplementation(() => Promise.resolve(sub));
    tx.casoPregunta.findUnique.mockImplementation(() => Promise.resolve(caso));
    tx.pregunta.findUnique.mockImplementation(() => Promise.resolve(question));
    tx.pregunta.findMany.mockResolvedValue([]);
    tx.pregunta.findFirst.mockResolvedValue(null);
    tx.tema.update.mockImplementation(({ data }: { data: object }) => {
      Object.assign(tema, data);
      return Promise.resolve(tema);
    });
    tx.subtema.update.mockImplementation(({ data }: { data: object }) => {
      Object.assign(sub, data);
      return Promise.resolve(sub);
    });
    tx.casoPregunta.update.mockImplementation(({ data }: { data: object }) => {
      Object.assign(caso, data);
      return Promise.resolve(caso);
    });
    tx.pregunta.update.mockImplementation(({ data }: { data: object }) => {
      Object.assign(question, data);
      return Promise.resolve(question);
    });
  });
  afterAll(() => {
    if (previousFlag === undefined)
      delete process.env.EDITORIAL_PUBLICATION_ENABLED;
    else process.env.EDITORIAL_PUBLICATION_ENABLED = previousFlag;
  });
  it('consulta revisión sin escribir y exige paso previo EN_REVISION', async () => {
    tema.estadoContenido = 'BORRADOR';
    const detail = await service.detalle('temas', 't1');
    expect(detail.destinos).toEqual(['EN_REVISION', 'ARCHIVADO']);
    expect(detail.contenido).toContain('Aritmética');
    expect(detail.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(tx.tema.update).not.toHaveBeenCalled();
    await expect(
      service.cambiar('temas', 't1', detail.revision, 'PUBLICADO'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('por defecto bloquea escrituras reales, pero permite consultar', async () => {
    delete process.env.EDITORIAL_PUBLICATION_ENABLED;
    const detail = await service.detalle('temas', 't1');
    expect(detail.habilitado).toBe(false);
    await expect(
      service.cambiar('temas', 't1', detail.revision, 'PUBLICADO'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('publica con bloqueo y huella recalculada sin modificar preguntas/respuestas', async () => {
    const detail = await service.detalle('preguntas', 'q1');
    const result = await service.cambiar(
      'preguntas',
      'q1',
      detail.revision,
      'PUBLICADO',
    );
    expect(result.estadoContenido).toBe('PUBLICADO');
    expect(
      tx.$queryRaw.mock.invocationCallOrder[
        tx.$queryRaw.mock.invocationCallOrder.length - 1
      ],
    ).toBeLessThan(tx.pregunta.update.mock.invocationCallOrder[0]);
    const expected = createQuestionFingerprint({
      area: 'MATEMATICAS',
      enunciado: question.enunciado,
      opciones: question.respuestas,
    });
    expect(tx.pregunta.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: {
        estadoContenido: 'PUBLICADO',
        fechaPublicacion: expect.any(Date) as unknown,
        huellaContenido: expected,
      },
    });
  });
  it('rechaza la revisión vieja aunque los datos cambien mientras espera el bloqueo', async () => {
    const detail = await service.detalle('preguntas', 'q1');
    tx.$queryRaw.mockImplementation(() => {
      question.enunciado = 'Modificado';
      return Promise.resolve([]);
    });
    await expect(
      service.cambiar('preguntas', 'q1', detail.revision, 'PUBLICADO'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it.each([
    'padre',
    'clasificacion',
    'explicacion',
    'correcta',
    'opciones',
    'duplicadas',
    'caso',
    'orden',
  ])('no publica con bloqueo %s', async (reason) => {
    if (reason === 'padre') question.subtema.tema.estadoContenido = 'BORRADOR';
    if (reason === 'clasificacion') question.subtema.nombre = 'Banco General';
    if (reason === 'explicacion') question.explicacion = '';
    if (reason === 'correcta') question.respuestas[1].esCorrecta = true;
    if (reason === 'opciones') question.respuestas = [];
    if (reason === 'duplicadas') question.respuestas[1].texto = '4';
    if (reason === 'orden') question.ordenEnCaso = 2;
    if (reason === 'caso') {
      question.casoId = 'c1';
      question.caso = {
        id: 'c1',
        contexto: 'Texto',
        titulo: 'Caso',
        imagenUrl: null,
        area: 'INGLES',
        estadoContenido: 'PUBLICADO',
      };
      question.ordenEnCaso = 1;
    }
    const detail = await service.detalle('preguntas', 'q1');
    expect(detail.bloqueos.length).toBeGreaterThan(0);
    expect(detail.destinos).not.toContain('PUBLICADO');
    await expect(
      service.cambiar('preguntas', 'q1', detail.revision, 'PUBLICADO'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('no publica duplicado heredado sin huella', async () => {
    tx.pregunta.findMany.mockResolvedValue([
      {
        id: 'duplicate',
        enunciado: question.enunciado,
        imagenUrl: null,
        huellaContenido: null,
        respuestas: question.respuestas,
      },
    ]);
    const detail = await service.detalle('preguntas', 'q1');
    expect(detail.bloqueos.join(' ')).toContain('duplicate');
    expect(detail.destinos).not.toContain('PUBLICADO');
  });
  it('si aparece otro duplicado después de previsualizar, lo detecta antes de publicar', async () => {
    const detail = await service.detalle('preguntas', 'q1');
    tx.pregunta.findMany.mockResolvedValue([
      {
        id: 'duplicate',
        enunciado: question.enunciado,
        imagenUrl: null,
        huellaContenido: null,
        respuestas: question.respuestas,
      },
    ]);
    await expect(
      service.cambiar('preguntas', 'q1', detail.revision, 'PUBLICADO'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.pregunta.update).not.toHaveBeenCalled();
  });
  it('bloquea validación incompleta del banco heredado', async () => {
    tx.pregunta.findMany.mockResolvedValue(
      Array.from({ length: 2001 }, () => ({})),
    );
    const detail = await service.detalle('preguntas', 'q1');
    expect(detail.bloqueos.join(' ')).toContain('indexar');
  });
  it('no archiva padres con dependientes publicados ni hace cascada', async () => {
    tema.estadoContenido = 'PUBLICADO';
    tema._count.subtemas = 1;
    const detail = await service.detalle('temas', 't1');
    expect(detail.destinos).not.toContain('ARCHIVADO');
    await expect(
      service.cambiar('temas', 't1', detail.revision, 'ARCHIVADO'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.subtema.update).not.toHaveBeenCalled();
    caso._count.preguntas = 1;
    const caseDetail = await service.detalle('casos', 'c1');
    expect(caseDetail.destinos).not.toContain('ARCHIVADO');
  });
  it('archiva sin borrar historial y conserva la fecha de primera publicación', async () => {
    tema.estadoContenido = 'PUBLICADO';
    tema.fechaPublicacion = new Date('2026-01-01');
    let detail = await service.detalle('temas', 't1');
    for (const state of [
      'ARCHIVADO',
      'BORRADOR',
      'EN_REVISION',
      'PUBLICADO',
    ] as const)
      detail = await service.cambiar('temas', 't1', detail.revision, state);
    expect(tema.fechaPublicacion.toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    expect(tx.subtema.update).not.toHaveBeenCalled();
  });
  it('advierte subtema sin lección y bloquea CLOZE sin datos', async () => {
    sub.estadoContenido = 'EN_REVISION';
    let detail = await service.detalle('subtemas', 's1');
    expect(detail.advertencias.join(' ')).toContain('sin lección');
    expect(detail.destinos).toContain('PUBLICADO');
    sub.tipoInteractivo = 'CLOZE';
    detail = await service.detalle('subtemas', 's1');
    expect(detail.destinos).not.toContain('PUBLICADO');
  });
  const cloze = () => ({
    textoConEspacios: 'Dos más dos es ___.',
    espacios: [{ opciones: ['4', '5'], correctaIndex: 0 }],
  });
  it('incluye texto, opciones y clave CLOZE en revisión sin publicar por leer', async () => {
    sub.estadoContenido = 'EN_REVISION';
    sub.tipoInteractivo = 'CLOZE';
    sub.datosInteractivo = cloze();
    const detail = await service.detalle('subtemas', 's1');
    expect(detail.bloqueos).toEqual([]);
    expect(detail.destinos).toContain('PUBLICADO');
    expect(detail.contenido).toEqual(
      expect.arrayContaining([
        'CLOZE: Dos más dos es ___.',
        'Espacio 1:',
        '1. 4 [CORRECTA]',
        '2. 5',
      ]),
    );
    expect(detail.advertencias.join(' ')).toContain('autocorrección');
    expect(tx.subtema.update).not.toHaveBeenCalled();
    await service.cambiar('subtemas', 's1', detail.revision, 'PUBLICADO');
    expect(tx.subtema.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        estadoContenido: 'PUBLICADO',
        fechaPublicacion: sub.fechaPublicacion,
      },
    });
    expect(sub.fechaPublicacion).toBeInstanceOf(Date);
  });
  it.each([
    'sinMarcador',
    'indiceTexto',
    'opcionesDuplicadas',
    'huerfano',
    'otroTipo',
  ])('bloquea publicación de interactivo inválido: %s', async (reason) => {
    sub.estadoContenido = 'EN_REVISION';
    sub.tipoInteractivo = 'CLOZE';
    const data: {
      textoConEspacios: string;
      espacios: { opciones: string[]; correctaIndex: unknown }[];
    } = cloze();
    if (reason === 'sinMarcador') data.textoConEspacios = 'Sin marcador';
    if (reason === 'indiceTexto') data.espacios[0].correctaIndex = '0';
    if (reason === 'opcionesDuplicadas') data.espacios[0].opciones = ['4', '4'];
    if (reason === 'huerfano') sub.tipoInteractivo = null;
    if (reason === 'otroTipo') sub.tipoInteractivo = 'OTRO';
    sub.datosInteractivo = data;
    const detail = await service.detalle('subtemas', 's1');
    expect(detail.bloqueos.length).toBeGreaterThan(0);
    await expect(
      service.cambiar('subtemas', 's1', detail.revision, 'PUBLICADO'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.subtema.update).not.toHaveBeenCalled();
  });
  it('un cambio en respuestas CLOZE invalida la revisión antes de publicar', async () => {
    sub.estadoContenido = 'EN_REVISION';
    sub.tipoInteractivo = 'CLOZE';
    sub.datosInteractivo = cloze();
    const before = await service.detalle('subtemas', 's1');
    sub.datosInteractivo = {
      ...cloze(),
      espacios: [{ opciones: ['4', '5'], correctaIndex: 1 }],
    };
    await expect(
      service.cambiar('subtemas', 's1', before.revision, 'PUBLICADO'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.subtema.update).not.toHaveBeenCalled();
  });
  it('CLOZE válido no evade la bandera de publicación apagada', async () => {
    process.env.EDITORIAL_PUBLICATION_ENABLED = 'false';
    sub.estadoContenido = 'EN_REVISION';
    sub.tipoInteractivo = 'CLOZE';
    sub.datosInteractivo = cloze();
    const detail = await service.detalle('subtemas', 's1');
    expect(detail.habilitado).toBe(false);
    await expect(
      service.cambiar('subtemas', 's1', detail.revision, 'PUBLICADO'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it.each(['false', 'true', 1, false])(
    'no convierte %j en confirmación editorial',
    (confirmado) => {
      expect(
        validateSync(
          plainToInstance(
            EditorialStateDto,
            {
              revision: 'a'.repeat(64),
              destino: 'PUBLICADO',
              confirmado,
            },
            { enableImplicitConversion: true },
          ),
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it('verifica DTO, confirmación explícita, ADMIN y recurso inexistente', async () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, EditorialReviewController),
    ).toEqual([AdminGuard]);
    expect(
      validateSync(
        plainToInstance(EditorialStateDto, {
          revision: 'a'.repeat(64),
          destino: 'PUBLICADO',
          confirmado: true,
        }),
      ),
    ).toHaveLength(0);
    expect(
      validateSync(
        plainToInstance(EditorialStateDto, {
          revision: 'a'.repeat(64),
          destino: 'PUBLICADO',
          confirmado: false,
        }),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      validateSync(
        plainToInstance(EditorialReviewParams, { tipo: 'usuarios', id: 'q' }),
      ).length,
    ).toBeGreaterThan(0);
    tx.tema.findUnique.mockResolvedValue(null);
    await expect(service.detalle('temas', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
