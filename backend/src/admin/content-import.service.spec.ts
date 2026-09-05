import { PrismaService } from '../prisma/prisma.service';
import { EstadoContenido } from '@prisma/client';
import {
  CASE_IMPORT_COLUMNS,
  ContentImportService,
  LESSON_IMPORT_COLUMNS,
  QUESTION_IMPORT_COLUMNS,
} from './content-import.service';
import {
  ContentPackageReaderService,
  ReadContentPackageResult,
} from './content-package-reader.service';

describe('ContentImportService', () => {
  const packageReader = { read: jest.fn() };
  const pregunta = { findMany: jest.fn() };
  const prisma = { pregunta } as unknown as PrismaService;
  const service = new ContentImportService(
    prisma,
    packageReader as unknown as ContentPackageReaderService,
  );
  const file = {
    originalname: 'contenido.xlsx',
    buffer: Buffer.from('mock'),
  } as Express.Multer.File;

  beforeEach(() => {
    jest.resetAllMocks();
    pregunta.findMany.mockResolvedValue([]);
  });

  it('previsualiza una pregunta original válida sin escribir en la base', async () => {
    packageReader.read.mockResolvedValue(
      packageWithSheets({
        Preguntas: [
          QUESTION_IMPORT_COLUMNS,
          row(QUESTION_IMPORT_COLUMNS, {
            codigo: 'MAT-REGLA-001',
            area: 'MATEMATICAS',
            tema: 'Razonamiento proporcional',
            subtema: 'Regla de tres',
            dificultad: 'MEDIO',
            enunciado: 'Si 3 cuadernos cuestan 12, ¿cuánto cuestan 5?',
            opcion_a: '15',
            opcion_b: '20',
            opcion_c: '25',
            respuesta_correcta: 'B',
            fuente: 'Equipo SaberPlus',
            tipo_autorizacion: 'ORIGINAL',
          }),
        ],
      }),
    );

    const result = await service.preview(file);

    expect(result.valido).toBe(true);
    expect(result.soloPrevisualizacion).toBe(true);
    expect(result.resumen).toEqual(
      expect.objectContaining({
        preguntas: 1,
        errores: 0,
        posiblesDuplicadosEnBase: 0,
      }),
    );
    expect(result.contenido.preguntas[0].opciones).toHaveLength(3);
    expect(pregunta.findMany).toHaveBeenCalledTimes(1);
  });

  it('detecta recursos ausentes, accesibilidad incompleta y respuesta inválida', async () => {
    packageReader.read.mockResolvedValue(
      packageWithSheets({
        Preguntas: [
          QUESTION_IMPORT_COLUMNS,
          row(QUESTION_IMPORT_COLUMNS, {
            codigo: 'LC-GRAF-001',
            area: 'LECTURA_CRITICA',
            tema: 'Lectura visual',
            subtema: 'Gráficas',
            dificultad: 'BASICO',
            enunciado: 'Observa la gráfica.',
            imagen_pregunta: 'recursos/grafica.png',
            opcion_a: 'Aumenta',
            opcion_b: 'Disminuye',
            respuesta_correcta: 'D',
            fuente: 'Equipo SaberPlus',
            tipo_autorizacion: 'ORIGINAL',
          }),
        ],
      }),
    );

    const result = await service.preview(file);

    expect(result.valido).toBe(false);
    expect(result.incidencias).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ codigo: 'RECURSO_NO_ENCONTRADO' }),
        expect.objectContaining({ codigo: 'TEXTO_ALTERNATIVO_REQUERIDO' }),
        expect.objectContaining({ codigo: 'RESPUESTA_CORRECTA_INVALIDA' }),
      ]),
    );
  });

  it('detecta contenido repetido dentro del mismo Excel', async () => {
    const base = {
      area: 'INGLES',
      tema: 'Vocabulary',
      subtema: 'Daily routines',
      dificultad: 'BASICO',
      enunciado: 'Choose the correct word.',
      opcion_a: 'Walk',
      opcion_b: 'Sleep',
      respuesta_correcta: 'A',
      fuente: 'Equipo SaberPlus',
      tipo_autorizacion: 'ORIGINAL',
    };
    packageReader.read.mockResolvedValue(
      packageWithSheets({
        Preguntas: [
          QUESTION_IMPORT_COLUMNS,
          row(QUESTION_IMPORT_COLUMNS, { ...base, codigo: 'ENG-001' }),
          row(QUESTION_IMPORT_COLUMNS, { ...base, codigo: 'ENG-002' }),
        ],
      }),
    );

    const result = await service.preview(file);

    expect(result.valido).toBe(false);
    expect(result.incidencias).toContainEqual(
      expect.objectContaining({
        codigo: 'CONTENIDO_REPETIDO',
        hoja: 'Preguntas',
        fila: 3,
      }),
    );
  });

  it('valida la relación y el área de preguntas basadas en casos', async () => {
    packageReader.read.mockResolvedValue(
      packageWithSheets({
        Casos: [
          CASE_IMPORT_COLUMNS,
          row(CASE_IMPORT_COLUMNS, {
            codigo: 'CASO-001',
            area: 'SOCIALES_CIUDADANAS',
            contexto: 'Una comunidad decide sobre el uso de un parque.',
            fuente: 'Equipo SaberPlus',
            tipo_autorizacion: 'ORIGINAL',
          }),
        ],
        Preguntas: [
          QUESTION_IMPORT_COLUMNS,
          row(QUESTION_IMPORT_COLUMNS, {
            codigo: 'CN-001',
            area: 'CIENCIAS_NATURALES',
            tema: 'Ecosistemas',
            subtema: 'Interacciones',
            dificultad: 'MEDIO',
            enunciado: '¿Qué relación se presenta?',
            caso_codigo: 'CASO-001',
            orden_en_caso: 1,
            opcion_a: 'Competencia',
            opcion_b: 'Mutualismo',
            respuesta_correcta: 'A',
            fuente: 'Equipo SaberPlus',
            tipo_autorizacion: 'ORIGINAL',
          }),
        ],
      }),
    );

    const result = await service.preview(file);

    expect(result.valido).toBe(false);
    expect(result.incidencias).toContainEqual(
      expect.objectContaining({ codigo: 'AREA_CASO_INCOMPATIBLE' }),
    );
  });

  it('bloquea una pregunta que ya se encuentra publicada', async () => {
    pregunta.findMany.mockResolvedValue([
      {
        id: 'existente-1',
        enunciado: '¿Cuánto es 2 + 2?',
        imagenUrl: null,
        huellaContenido: null,
        estadoContenido: EstadoContenido.PUBLICADO,
        respuestas: [{ texto: '5' }, { texto: '4' }],
        subtema: {
          tema: { area: 'MATEMATICAS' },
        },
      },
    ]);
    packageReader.read.mockResolvedValue(
      packageWithSheets({
        Lecciones: [LESSON_IMPORT_COLUMNS],
        Preguntas: [
          QUESTION_IMPORT_COLUMNS,
          row(QUESTION_IMPORT_COLUMNS, {
            codigo: 'MAT-002',
            area: 'MATEMATICAS',
            tema: 'Aritmética',
            subtema: 'Suma',
            dificultad: 'BASICO',
            enunciado: '¿Cuánto es 2 + 2?',
            opcion_a: '4',
            opcion_b: '5',
            respuesta_correcta: 'A',
            fuente: 'Equipo SaberPlus',
            tipo_autorizacion: 'ORIGINAL',
          }),
        ],
      }),
    );

    const result = await service.preview(file);

    expect(result.valido).toBe(false);
    expect(result.resumen.posiblesDuplicadosEnBase).toBe(1);
    expect(result.resumen.preguntasYaPublicadas).toBe(1);
    expect(result.contenido.preguntas[0].coincidenciaEnBase).toEqual({
      id: 'existente-1',
      estadoContenido: EstadoContenido.PUBLICADO,
    });
    expect(result.incidencias).toContainEqual(
      expect.objectContaining({
        severidad: 'ERROR',
        codigo: 'PREGUNTA_YA_PUBLICADA',
      }),
    );
  });

  it('rechaza un Excel que solo contiene encabezados', async () => {
    packageReader.read.mockResolvedValue(
      packageWithSheets({ Preguntas: [QUESTION_IMPORT_COLUMNS] }),
    );

    const result = await service.preview(file);

    expect(result.valido).toBe(false);
    expect(result.incidencias).toContainEqual(
      expect.objectContaining({ codigo: 'CONTENIDO_VACIO' }),
    );
  });

  it('detecta órdenes repetidos dentro del mismo caso', async () => {
    const baseQuestion = {
      area: 'LECTURA_CRITICA',
      tema: 'Comprensión textual',
      subtema: 'Textos continuos',
      dificultad: 'MEDIO',
      caso_codigo: 'CASO-TEXTO-001',
      orden_en_caso: 1,
      opcion_a: 'Primera',
      opcion_b: 'Segunda',
      respuesta_correcta: 'A',
      fuente: 'Equipo SaberPlus',
      tipo_autorizacion: 'ORIGINAL',
    };
    packageReader.read.mockResolvedValue(
      packageWithSheets({
        Casos: [
          CASE_IMPORT_COLUMNS,
          row(CASE_IMPORT_COLUMNS, {
            codigo: 'CASO-TEXTO-001',
            area: 'LECTURA_CRITICA',
            contexto: 'Texto compartido por dos preguntas.',
            fuente: 'Equipo SaberPlus',
            tipo_autorizacion: 'ORIGINAL',
          }),
        ],
        Preguntas: [
          QUESTION_IMPORT_COLUMNS,
          row(QUESTION_IMPORT_COLUMNS, {
            ...baseQuestion,
            codigo: 'LC-CASO-001',
            enunciado: 'Primera pregunta del caso.',
          }),
          row(QUESTION_IMPORT_COLUMNS, {
            ...baseQuestion,
            codigo: 'LC-CASO-002',
            enunciado: 'Segunda pregunta del caso.',
          }),
        ],
      }),
    );

    const result = await service.preview(file);

    expect(result.valido).toBe(false);
    expect(result.incidencias).toContainEqual(
      expect.objectContaining({
        codigo: 'ORDEN_CASO_REPETIDO',
        fila: 3,
      }),
    );
  });

  it('expone el formato versionado para el futuro panel administrativo', () => {
    const format = service.getFormat();

    expect(format.version).toBe(1);
    expect(format.archivo.campoFormulario).toBe('archivo');
    expect(format.hojas.Preguntas.columnas).toEqual(QUESTION_IMPORT_COLUMNS);
    expect(format.catalogos.opciones).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });
});

function row(columns: string[], values: Record<string, string | number>) {
  return columns.map((column) => values[column] ?? null);
}

function packageWithSheets(
  sheets: Record<string, Array<Array<string | number | null>>>,
): ReadContentPackageResult {
  return {
    packageType: 'XLSX',
    workbookName: 'contenido.xlsx',
    sheets: new Map(
      Object.entries(sheets).map(([name, data]) => [
        name.toLocaleLowerCase('es-CO'),
        data,
      ]),
    ),
    assets: new Map(),
    packageEntries: 1,
  };
}
