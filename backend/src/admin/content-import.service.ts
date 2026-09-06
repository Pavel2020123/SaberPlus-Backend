import { Injectable } from '@nestjs/common';
import { AreaIcfes, Dificultad, EstadoContenido } from '@prisma/client';
import { createHash } from 'node:crypto';
import { CellValue, SheetData } from 'read-excel-file/node';
import { PrismaService } from '../prisma/prisma.service';
import { createQuestionFingerprint } from '../common/question-fingerprint';
import { validateCatalogName } from './academic-classification';
import {
  ContentPackageAsset,
  ContentPackageReaderService,
  ReadContentPackageResult,
} from './content-package-reader.service';

type SeveridadIncidencia = 'ERROR' | 'ADVERTENCIA';

export interface IncidenciaImportacion {
  severidad: SeveridadIncidencia;
  codigo: string;
  mensaje: string;
  hoja?: string;
  fila?: number;
  columna?: string;
}

export interface OpcionPrevisualizada {
  letra: string;
  texto: string | null;
  imagen: string | null;
  textoAlternativo: string | null;
  explicacion: string | null;
}

export interface CasoPrevisualizado {
  fila: number;
  codigo: string;
  area: string;
  titulo: string | null;
  contexto: string;
  imagen: string | null;
  textoAlternativo: string | null;
  fuente: string;
  tipoAutorizacion: string;
  referenciaAutorizacion: string | null;
  huella: string;
}

export interface PreguntaPrevisualizada {
  fila: number;
  codigo: string;
  area: string;
  tema: string;
  subtema: string;
  dificultad: string;
  enunciado: string;
  explicacionGeneral: string | null;
  imagen: string | null;
  textoAlternativo: string | null;
  casoCodigo: string | null;
  ordenEnCaso: number | null;
  opciones: OpcionPrevisualizada[];
  respuestaCorrecta: string;
  fuente: string;
  tipoAutorizacion: string;
  referenciaAutorizacion: string | null;
  huella: string;
  posibleDuplicadoEnBase: boolean;
  coincidenciaEnBase: {
    id: string;
    estadoContenido: EstadoContenido;
  } | null;
}

export interface LeccionPrevisualizada {
  fila: number;
  codigo: string;
  area: string;
  tema: string;
  subtema: string;
  contenidoMarkdown: string;
  imagen: string | null;
  textoAlternativo: string | null;
  videoUrl: string | null;
  fuente: string;
  tipoAutorizacion: string;
  referenciaAutorizacion: string | null;
  huella: string;
}

const MAX_ROWS_PER_SHEET = 1000;
const MAX_SHORT_TEXT = 500;
const MAX_LONG_TEXT = 30_000;
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/;
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const AUTHORIZATION_TYPES = new Set([
  'ORIGINAL',
  'LICENCIA',
  'DOMINIO_PUBLICO',
  'AUTORIZACION_ESCRITA',
]);
const VALID_AREAS = new Set(Object.values(AreaIcfes));
const VALID_DIFFICULTIES = new Set(Object.values(Dificultad));

export const QUESTION_IMPORT_COLUMNS = [
  'codigo',
  'area',
  'tema',
  'subtema',
  'dificultad',
  'enunciado',
  'explicacion_general',
  'imagen_pregunta',
  'texto_alternativo_imagen',
  'caso_codigo',
  'orden_en_caso',
  ...OPTION_LETTERS.flatMap((letter) => {
    const lower = letter.toLowerCase();
    return [
      `opcion_${lower}`,
      `imagen_opcion_${lower}`,
      `texto_alternativo_${lower}`,
      `explicacion_${lower}`,
    ];
  }),
  'respuesta_correcta',
  'fuente',
  'tipo_autorizacion',
  'referencia_autorizacion',
];

export const LESSON_IMPORT_COLUMNS = [
  'codigo',
  'area',
  'tema',
  'subtema',
  'contenido_markdown',
  'imagen',
  'texto_alternativo_imagen',
  'video_url',
  'fuente',
  'tipo_autorizacion',
  'referencia_autorizacion',
];

export const CASE_IMPORT_COLUMNS = [
  'codigo',
  'area',
  'titulo',
  'contexto',
  'imagen',
  'texto_alternativo_imagen',
  'fuente',
  'tipo_autorizacion',
  'referencia_autorizacion',
];

@Injectable()
export class ContentImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly packageReader: ContentPackageReaderService,
  ) {}

  getFormat() {
    return {
      version: 1,
      archivo: {
        formatosAceptados: ['.xlsx', '.zip'],
        campoFormulario: 'archivo',
        tamanoMaximoMb: 25,
        filasMaximasPorHoja: MAX_ROWS_PER_SHEET,
      },
      hojas: {
        Preguntas: {
          obligatoria: false,
          columnas: QUESTION_IMPORT_COLUMNS,
        },
        Lecciones: {
          obligatoria: false,
          columnas: LESSON_IMPORT_COLUMNS,
        },
        Casos: {
          obligatoria: false,
          columnas: CASE_IMPORT_COLUMNS,
        },
      },
      catalogos: {
        areas: [...VALID_AREAS],
        dificultades: [...VALID_DIFFICULTIES],
        tiposAutorizacion: [...AUTHORIZATION_TYPES],
        opciones: [...OPTION_LETTERS],
      },
      reglas: [
        'Debe existir al menos una fila de contenido entre las tres hojas.',
        'Las imágenes se incluyen dentro de un ZIP y se referencian con rutas relativas.',
        'Cada imagen requiere texto alternativo.',
        'El contenido importado queda en borrador hasta que un administrador lo revise y publique.',
      ],
    };
  }

  async preview(file: Express.Multer.File) {
    const packageData = await this.packageReader.read(file);
    const issues: IncidenciaImportacion[] = [];
    const usedAssets = new Set<string>();

    const questionRows = this.getSheetRows(
      packageData,
      'Preguntas',
      QUESTION_IMPORT_COLUMNS,
      issues,
    );
    const lessonRows = this.getSheetRows(
      packageData,
      'Lecciones',
      LESSON_IMPORT_COLUMNS,
      issues,
      true,
    );
    const caseRows = this.getSheetRows(
      packageData,
      'Casos',
      CASE_IMPORT_COLUMNS,
      issues,
      true,
    );

    if (!questionRows && !lessonRows && !caseRows) {
      issues.push({
        severidad: 'ERROR',
        codigo: 'HOJAS_AUSENTES',
        mensaje:
          'El Excel debe incluir al menos una hoja Preguntas, Lecciones o Casos.',
      });
    }

    const cases = caseRows
      ? this.parseCases(caseRows, packageData.assets, usedAssets, issues)
      : [];
    const casesByCode = new Map(cases.map((item) => [item.codigo, item]));
    const questions = questionRows
      ? this.parseQuestions(
          questionRows,
          casesByCode,
          packageData.assets,
          usedAssets,
          issues,
        )
      : [];
    const lessons = lessonRows
      ? this.parseLessons(lessonRows, packageData.assets, usedAssets, issues)
      : [];

    if (cases.length + questions.length + lessons.length === 0) {
      issues.push({
        severidad: 'ERROR',
        codigo: 'CONTENIDO_VACIO',
        mensaje:
          'El Excel debe contener al menos una fila en Preguntas, Lecciones o Casos.',
      });
    }

    this.validateDuplicateCodes(cases, questions, lessons, issues);
    this.validateDuplicateFingerprints(cases, questions, lessons, issues);
    this.validateDuplicateCaseOrders(questions, issues);
    await this.markExistingQuestions(questions, issues);

    for (const [key, asset] of packageData.assets) {
      if (!usedAssets.has(key)) {
        issues.push({
          severidad: 'ADVERTENCIA',
          codigo: 'ARCHIVO_SIN_USO',
          mensaje: `El recurso ${asset.path} no está referenciado en el Excel.`,
        });
      }
    }

    const errors = issues.filter((item) => item.severidad === 'ERROR').length;
    const warnings = issues.length - errors;
    const uniqueCases = new Set(
      questions.map((item) => item.casoCodigo).filter(Boolean),
    ).size;

    return {
      valido: errors === 0,
      soloPrevisualizacion: true,
      archivo: {
        tipo: packageData.packageType,
        excel: packageData.workbookName,
        entradas: packageData.packageEntries,
        recursos: packageData.assets.size,
      },
      resumen: {
        preguntas: questions.length,
        lecciones: lessons.length,
        casosDefinidos: cases.length,
        casosUsados: uniqueCases,
        errores: errors,
        advertencias: warnings,
        posiblesDuplicadosEnBase: questions.filter(
          (item) => item.posibleDuplicadoEnBase,
        ).length,
        preguntasYaPublicadas: questions.filter(
          (item) =>
            item.coincidenciaEnBase?.estadoContenido ===
            EstadoContenido.PUBLICADO,
        ).length,
        preguntasYaRegistradas: questions.filter(
          (item) => item.coincidenciaEnBase !== null,
        ).length,
      },
      incidencias: issues,
      contenido: {
        preguntas: questions,
        lecciones: lessons,
        casos: cases,
      },
      siguientePaso:
        errors === 0
          ? 'Revisar la vista previa. La confirmación y publicación se habilitarán en el panel administrativo.'
          : 'Corrige los errores del Excel o ZIP y vuelve a generar la vista previa.',
    };
  }

  private getSheetRows(
    packageData: ReadContentPackageResult,
    sheetName: string,
    expectedColumns: string[],
    issues: IncidenciaImportacion[],
    optional = false,
  ): {
    sheetName: string;
    rows: SheetData;
    indexes: Map<string, number>;
  } | null {
    const sheet = packageData.sheets.get(sheetName.toLocaleLowerCase('es-CO'));
    if (!sheet) {
      if (!optional) {
        issues.push({
          severidad: 'ADVERTENCIA',
          codigo: 'HOJA_PREGUNTAS_AUSENTE',
          hoja: sheetName,
          mensaje: `No se encontró la hoja ${sheetName}.`,
        });
      }
      return null;
    }
    if (sheet.length === 0) {
      issues.push({
        severidad: 'ERROR',
        codigo: 'HOJA_VACIA',
        hoja: sheetName,
        mensaje: `La hoja ${sheetName} no tiene encabezados.`,
      });
      return null;
    }

    const indexes = new Map<string, number>();
    sheet[0].forEach((value, index) => {
      const header = this.normalizeHeader(value);
      if (!header) return;
      if (indexes.has(header)) {
        issues.push({
          severidad: 'ERROR',
          codigo: 'ENCABEZADO_REPETIDO',
          hoja: sheetName,
          fila: 1,
          columna: header,
          mensaje: `El encabezado ${header} está repetido.`,
        });
      } else {
        indexes.set(header, index);
      }
    });

    for (const column of expectedColumns) {
      if (!indexes.has(column)) {
        issues.push({
          severidad: 'ERROR',
          codigo: 'COLUMNA_AUSENTE',
          hoja: sheetName,
          fila: 1,
          columna: column,
          mensaje: `Falta la columna obligatoria ${column}.`,
        });
      }
    }

    const rows = sheet
      .slice(1)
      .filter((row) =>
        row.some((cell) => cell !== null && String(cell).trim().length > 0),
      );
    if (rows.length > MAX_ROWS_PER_SHEET) {
      issues.push({
        severidad: 'ERROR',
        codigo: 'DEMASIADAS_FILAS',
        hoja: sheetName,
        mensaje: `La hoja ${sheetName} supera ${MAX_ROWS_PER_SHEET} filas por paquete.`,
      });
      return { sheetName, rows: rows.slice(0, MAX_ROWS_PER_SHEET), indexes };
    }
    return { sheetName, rows, indexes };
  }

  private parseCases(
    sheet: NonNullable<ReturnType<ContentImportService['getSheetRows']>>,
    assets: Map<string, ContentPackageAsset>,
    usedAssets: Set<string>,
    issues: IncidenciaImportacion[],
  ) {
    return sheet.rows.map((row, index) => {
      const line = index + 2;
      const get = (column: string, max = MAX_SHORT_TEXT) =>
        this.getText(
          row,
          sheet.indexes,
          column,
          sheet.sheetName,
          line,
          issues,
          max,
        );
      const code = get('codigo').toUpperCase();
      const area = get('area').toUpperCase();
      const context = get('contexto', MAX_LONG_TEXT);
      const image = this.validateAssetReference(
        get('imagen'),
        'imagen',
        sheet.sheetName,
        line,
        assets,
        usedAssets,
        issues,
      );
      const alt = get('texto_alternativo_imagen');
      const source = get('fuente');
      const authorization = get('tipo_autorizacion').toUpperCase();
      const authorizationReference = get('referencia_autorizacion') || null;
      this.validateRequired(code, 'codigo', sheet.sheetName, line, issues);
      this.validateCode(code, sheet.sheetName, line, issues);
      this.validateArea(area, sheet.sheetName, line, issues);
      this.validateRequired(context, 'contexto', sheet.sheetName, line, issues);
      this.validateAccessibility(image, alt, sheet.sheetName, line, issues);
      this.validateAuthorization(
        source,
        authorization,
        authorizationReference,
        sheet.sheetName,
        line,
        issues,
      );
      return {
        fila: line,
        codigo: code,
        area,
        titulo: get('titulo') || null,
        contexto: context,
        imagen: image,
        textoAlternativo: alt || null,
        fuente: source,
        tipoAutorizacion: authorization,
        referenciaAutorizacion: authorizationReference,
        huella: this.hash([area, context, image ?? '']),
      } satisfies CasoPrevisualizado;
    });
  }

  private parseQuestions(
    sheet: NonNullable<ReturnType<ContentImportService['getSheetRows']>>,
    casesByCode: Map<string, CasoPrevisualizado>,
    assets: Map<string, ContentPackageAsset>,
    usedAssets: Set<string>,
    issues: IncidenciaImportacion[],
  ): PreguntaPrevisualizada[] {
    return sheet.rows.map((row, index) => {
      const line = index + 2;
      const get = (column: string, max = MAX_SHORT_TEXT) =>
        this.getText(
          row,
          sheet.indexes,
          column,
          sheet.sheetName,
          line,
          issues,
          max,
        );
      const code = get('codigo').toUpperCase();
      const area = get('area').toUpperCase();
      const theme = get('tema');
      const subtheme = get('subtema');
      const difficulty = get('dificultad').toUpperCase();
      const statement = get('enunciado', MAX_LONG_TEXT);
      const questionImage = this.validateAssetReference(
        get('imagen_pregunta'),
        'imagen_pregunta',
        sheet.sheetName,
        line,
        assets,
        usedAssets,
        issues,
      );
      const questionAlt = get('texto_alternativo_imagen');
      const caseCode = get('caso_codigo').toUpperCase() || null;
      const caseOrder = this.getPositiveInteger(
        row,
        sheet.indexes,
        'orden_en_caso',
        sheet.sheetName,
        line,
        issues,
      );
      const correct = get('respuesta_correcta').toUpperCase();
      const source = get('fuente');
      const authorization = get('tipo_autorizacion').toUpperCase();
      const authorizationReference = get('referencia_autorizacion') || null;
      const options: OpcionPrevisualizada[] = [];

      for (const letter of OPTION_LETTERS) {
        const lower = letter.toLowerCase();
        const text = get(`opcion_${lower}`, MAX_LONG_TEXT);
        const image = this.validateAssetReference(
          get(`imagen_opcion_${lower}`),
          `imagen_opcion_${lower}`,
          sheet.sheetName,
          line,
          assets,
          usedAssets,
          issues,
        );
        const alt = get(`texto_alternativo_${lower}`);
        const explanation = get(`explicacion_${lower}`, MAX_LONG_TEXT);
        if (!text && !image && !alt && !explanation) continue;
        if (!text && !image) {
          this.addError(
            issues,
            'OPCION_SIN_CONTENIDO',
            `La opción ${letter} necesita texto o imagen.`,
            sheet.sheetName,
            line,
            `opcion_${lower}`,
          );
        }
        this.validateAccessibility(
          image,
          alt,
          sheet.sheetName,
          line,
          issues,
          letter,
        );
        options.push({
          letra: letter,
          texto: text || null,
          imagen: image,
          textoAlternativo: alt || null,
          explicacion: explanation || null,
        });
      }

      this.validateRequired(code, 'codigo', sheet.sheetName, line, issues);
      this.validateCode(code, sheet.sheetName, line, issues);
      this.validateArea(area, sheet.sheetName, line, issues);
      this.validateRequired(theme, 'tema', sheet.sheetName, line, issues);
      this.validateRequired(subtheme, 'subtema', sheet.sheetName, line, issues);
      this.validateClassificationNames(
        theme,
        subtheme,
        sheet.sheetName,
        line,
        issues,
      );
      if (!VALID_DIFFICULTIES.has(difficulty as Dificultad)) {
        this.addError(
          issues,
          'DIFICULTAD_INVALIDA',
          'La dificultad debe ser BASICO, MEDIO o AVANZADO.',
          sheet.sheetName,
          line,
          'dificultad',
        );
      }
      this.validateRequired(
        statement,
        'enunciado',
        sheet.sheetName,
        line,
        issues,
      );
      this.validateAccessibility(
        questionImage,
        questionAlt,
        sheet.sheetName,
        line,
        issues,
      );
      if (options.length < 2) {
        this.addError(
          issues,
          'OPCIONES_INSUFICIENTES',
          'La pregunta necesita al menos dos opciones.',
          sheet.sheetName,
          line,
        );
      }
      const expectedLetters = OPTION_LETTERS.slice(0, options.length);
      if (
        options.some(
          (option, position) => option.letra !== expectedLetters[position],
        )
      ) {
        this.addError(
          issues,
          'OPCIONES_CON_HUECOS',
          'Las opciones deben llenarse consecutivamente desde A, sin saltos.',
          sheet.sheetName,
          line,
        );
      }
      if (!options.some((option) => option.letra === correct)) {
        this.addError(
          issues,
          'RESPUESTA_CORRECTA_INVALIDA',
          'respuesta_correcta debe ser la letra de una opción diligenciada.',
          sheet.sheetName,
          line,
          'respuesta_correcta',
        );
      }
      if (caseCode) {
        const relatedCase = casesByCode.get(caseCode);
        if (!relatedCase) {
          this.addError(
            issues,
            'CASO_NO_DEFINIDO',
            `El caso ${caseCode} no existe en la hoja Casos.`,
            sheet.sheetName,
            line,
            'caso_codigo',
          );
        } else if (relatedCase.area !== area) {
          this.addError(
            issues,
            'AREA_CASO_INCOMPATIBLE',
            `La pregunta y el caso ${caseCode} deben pertenecer a la misma área.`,
            sheet.sheetName,
            line,
            'caso_codigo',
          );
        }
        if (caseOrder === null) {
          this.addError(
            issues,
            'ORDEN_CASO_REQUERIDO',
            'Indica orden_en_caso cuando la pregunta usa un caso.',
            sheet.sheetName,
            line,
            'orden_en_caso',
          );
        }
      } else if (caseOrder !== null) {
        this.addError(
          issues,
          'CASO_REQUERIDO',
          'No indiques orden_en_caso sin caso_codigo.',
          sheet.sheetName,
          line,
          'orden_en_caso',
        );
      }
      this.validateAuthorization(
        source,
        authorization,
        authorizationReference,
        sheet.sheetName,
        line,
        issues,
      );

      return {
        fila: line,
        codigo: code,
        area,
        tema: theme,
        subtema: subtheme,
        dificultad: difficulty,
        enunciado: statement,
        explicacionGeneral: get('explicacion_general', MAX_LONG_TEXT) || null,
        imagen: questionImage,
        textoAlternativo: questionAlt || null,
        casoCodigo: caseCode,
        ordenEnCaso: caseOrder,
        opciones: options,
        respuestaCorrecta: correct,
        fuente: source,
        tipoAutorizacion: authorization,
        referenciaAutorizacion: authorizationReference,
        huella: createQuestionFingerprint({
          area,
          enunciado: statement,
          imagen: this.getAssetIdentity(questionImage, assets),
          opciones: options.map((option) => ({
            texto: option.texto,
            imagen: this.getAssetIdentity(option.imagen, assets),
          })),
        }),
        posibleDuplicadoEnBase: false,
        coincidenciaEnBase: null,
      } satisfies PreguntaPrevisualizada;
    });
  }

  private parseLessons(
    sheet: NonNullable<ReturnType<ContentImportService['getSheetRows']>>,
    assets: Map<string, ContentPackageAsset>,
    usedAssets: Set<string>,
    issues: IncidenciaImportacion[],
  ) {
    return sheet.rows.map((row, index) => {
      const line = index + 2;
      const get = (column: string, max = MAX_SHORT_TEXT) =>
        this.getText(
          row,
          sheet.indexes,
          column,
          sheet.sheetName,
          line,
          issues,
          max,
        );
      const code = get('codigo').toUpperCase();
      const area = get('area').toUpperCase();
      const theme = get('tema');
      const subtheme = get('subtema');
      const content = get('contenido_markdown', MAX_LONG_TEXT);
      const image = this.validateAssetReference(
        get('imagen'),
        'imagen',
        sheet.sheetName,
        line,
        assets,
        usedAssets,
        issues,
      );
      const alt = get('texto_alternativo_imagen');
      const videoUrl = get('video_url') || null;
      const source = get('fuente');
      const authorization = get('tipo_autorizacion').toUpperCase();
      const authorizationReference = get('referencia_autorizacion') || null;

      this.validateRequired(code, 'codigo', sheet.sheetName, line, issues);
      this.validateCode(code, sheet.sheetName, line, issues);
      this.validateArea(area, sheet.sheetName, line, issues);
      this.validateRequired(theme, 'tema', sheet.sheetName, line, issues);
      this.validateRequired(subtheme, 'subtema', sheet.sheetName, line, issues);
      this.validateClassificationNames(
        theme,
        subtheme,
        sheet.sheetName,
        line,
        issues,
      );
      this.validateRequired(
        content,
        'contenido_markdown',
        sheet.sheetName,
        line,
        issues,
      );
      this.validateAccessibility(image, alt, sheet.sheetName, line, issues);
      if (videoUrl)
        this.validateHttpsUrl(videoUrl, sheet.sheetName, line, issues);
      this.validateAuthorization(
        source,
        authorization,
        authorizationReference,
        sheet.sheetName,
        line,
        issues,
      );

      return {
        fila: line,
        codigo: code,
        area,
        tema: theme,
        subtema: subtheme,
        contenidoMarkdown: content,
        imagen: image,
        textoAlternativo: alt || null,
        videoUrl,
        fuente: source,
        tipoAutorizacion: authorization,
        referenciaAutorizacion: authorizationReference,
        huella: this.hash([area, theme, subtheme, content]),
      } satisfies LeccionPrevisualizada;
    });
  }

  private getText(
    row: CellValue[],
    indexes: Map<string, number>,
    column: string,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
    maxLength: number,
  ) {
    const index = indexes.get(column);
    if (index === undefined) return '';
    const value = row[index];
    if (value === null || value === undefined) return '';
    if (value instanceof Date) {
      this.addError(
        issues,
        'TIPO_CELDA_INVALIDO',
        `La columna ${column} debe contener texto, no una fecha.`,
        sheet,
        line,
        column,
      );
      return '';
    }
    const text = String(value).trim().replaceAll('\r\n', '\n');
    if (text.length > maxLength) {
      this.addError(
        issues,
        'TEXTO_DEMASIADO_LARGO',
        `La columna ${column} supera ${maxLength} caracteres.`,
        sheet,
        line,
        column,
      );
      return text.slice(0, maxLength);
    }
    return text;
  }

  private getPositiveInteger(
    row: CellValue[],
    indexes: Map<string, number>,
    column: string,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
  ) {
    const raw = this.getText(row, indexes, column, sheet, line, issues, 20);
    if (!raw) return null;
    const number = Number(raw);
    if (!Number.isSafeInteger(number) || number < 1) {
      this.addError(
        issues,
        'ENTERO_POSITIVO_INVALIDO',
        `${column} debe ser un número entero mayor que cero.`,
        sheet,
        line,
        column,
      );
      return null;
    }
    return number;
  }

  private validateAssetReference(
    raw: string,
    column: string,
    sheet: string,
    line: number,
    assets: Map<string, ContentPackageAsset>,
    usedAssets: Set<string>,
    issues: IncidenciaImportacion[],
  ) {
    if (!raw) return null;
    const normalized = raw.replaceAll('\\', '/');
    const segments = normalized.split('/');
    if (
      normalized.startsWith('/') ||
      /^[a-zA-Z]:/.test(normalized) ||
      segments.some((segment) => segment === '..' || segment === '.') ||
      /^https?:\/\//i.test(normalized)
    ) {
      this.addError(
        issues,
        'RUTA_RECURSO_INVALIDA',
        'Usa una ruta relativa dentro del ZIP, por ejemplo recursos/grafica.png.',
        sheet,
        line,
        column,
      );
      return normalized;
    }
    const key = normalized.toLocaleLowerCase('es-CO');
    if (!assets.has(key)) {
      this.addError(
        issues,
        'RECURSO_NO_ENCONTRADO',
        `No se encontró ${normalized} dentro del ZIP.`,
        sheet,
        line,
        column,
      );
    } else {
      usedAssets.add(key);
    }
    return normalized;
  }

  private validateAccessibility(
    image: string | null,
    alt: string,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
    option?: string,
  ) {
    if (image && !alt) {
      this.addError(
        issues,
        'TEXTO_ALTERNATIVO_REQUERIDO',
        option
          ? `La imagen de la opción ${option} necesita texto alternativo.`
          : 'Cada imagen necesita texto alternativo.',
        sheet,
        line,
      );
    }
    if (!image && alt) {
      issues.push({
        severidad: 'ADVERTENCIA',
        codigo: 'TEXTO_ALTERNATIVO_SIN_IMAGEN',
        hoja: sheet,
        fila: line,
        mensaje:
          'Hay texto alternativo, pero la fila no referencia una imagen.',
      });
    }
  }

  private validateAuthorization(
    source: string,
    authorization: string,
    reference: string | null,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
  ) {
    this.validateRequired(source, 'fuente', sheet, line, issues);
    if (!AUTHORIZATION_TYPES.has(authorization)) {
      this.addError(
        issues,
        'AUTORIZACION_INVALIDA',
        'tipo_autorizacion debe ser ORIGINAL, LICENCIA, DOMINIO_PUBLICO o AUTORIZACION_ESCRITA.',
        sheet,
        line,
        'tipo_autorizacion',
      );
    }
    if (authorization && authorization !== 'ORIGINAL' && !reference) {
      this.addError(
        issues,
        'REFERENCIA_AUTORIZACION_REQUERIDA',
        'Indica la licencia, URL o documento que autoriza este contenido.',
        sheet,
        line,
        'referencia_autorizacion',
      );
    }
  }

  private validateRequired(
    value: string,
    column: string,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
  ) {
    if (!value) {
      this.addError(
        issues,
        'VALOR_REQUERIDO',
        `La columna ${column} es obligatoria.`,
        sheet,
        line,
        column,
      );
    }
  }

  private validateCode(
    code: string,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
  ) {
    if (code && !CODE_PATTERN.test(code)) {
      this.addError(
        issues,
        'CODIGO_INVALIDO',
        'El código admite de 3 a 64 caracteres: letras, números, guion y guion bajo.',
        sheet,
        line,
        'codigo',
      );
    }
  }

  private validateArea(
    area: string,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
  ) {
    if (!VALID_AREAS.has(area as AreaIcfes)) {
      this.addError(
        issues,
        'AREA_INVALIDA',
        `Área inválida. Usa: ${[...VALID_AREAS].join(', ')}.`,
        sheet,
        line,
        'area',
      );
    }
  }

  private validateHttpsUrl(
    raw: string,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
  ) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') throw new Error('not https');
    } catch {
      this.addError(
        issues,
        'URL_VIDEO_INVALIDA',
        'video_url debe ser una URL HTTPS válida.',
        sheet,
        line,
        'video_url',
      );
    }
  }

  private validateDuplicateCodes(
    cases: CasoPrevisualizado[],
    questions: PreguntaPrevisualizada[],
    lessons: LeccionPrevisualizada[],
    issues: IncidenciaImportacion[],
  ) {
    for (const [sheet, items] of [
      ['Casos', cases],
      ['Preguntas', questions],
      ['Lecciones', lessons],
    ] as const) {
      const seen = new Map<string, number>();
      for (const item of items) {
        if (!item.codigo) continue;
        const previous = seen.get(item.codigo);
        if (previous) {
          this.addError(
            issues,
            'CODIGO_REPETIDO',
            `El código ${item.codigo} ya fue usado en la fila ${previous}.`,
            sheet,
            item.fila,
            'codigo',
          );
        } else {
          seen.set(item.codigo, item.fila);
        }
      }
    }
  }

  private validateDuplicateFingerprints(
    cases: CasoPrevisualizado[],
    questions: PreguntaPrevisualizada[],
    lessons: LeccionPrevisualizada[],
    issues: IncidenciaImportacion[],
  ) {
    for (const [sheet, items] of [
      ['Casos', cases],
      ['Preguntas', questions],
      ['Lecciones', lessons],
    ] as const) {
      const seen = new Map<string, number>();
      for (const item of items) {
        const previous = seen.get(item.huella);
        if (previous) {
          this.addError(
            issues,
            'CONTENIDO_REPETIDO',
            `El contenido coincide con la fila ${previous}, aunque use otro código.`,
            sheet,
            item.fila,
          );
        } else {
          seen.set(item.huella, item.fila);
        }
      }
    }
  }

  private validateDuplicateCaseOrders(
    questions: PreguntaPrevisualizada[],
    issues: IncidenciaImportacion[],
  ) {
    const seen = new Map<string, number>();
    for (const question of questions) {
      if (!question.casoCodigo || question.ordenEnCaso === null) continue;
      const key = `${question.casoCodigo}\u001f${question.ordenEnCaso}`;
      const previous = seen.get(key);
      if (previous) {
        this.addError(
          issues,
          'ORDEN_CASO_REPETIDO',
          `El caso ${question.casoCodigo} ya usa el orden ${question.ordenEnCaso} en la fila ${previous}.`,
          'Preguntas',
          question.fila,
          'orden_en_caso',
        );
      } else {
        seen.set(key, question.fila);
      }
    }
  }

  private async markExistingQuestions(
    questions: PreguntaPrevisualizada[],
    issues: IncidenciaImportacion[],
  ) {
    const fingerprints = [...new Set(questions.map((item) => item.huella))];
    const statements = [...new Set(questions.map((item) => item.enunciado))]
      .filter(Boolean)
      .slice(0, MAX_ROWS_PER_SHEET);
    if (fingerprints.length === 0) return;
    const existing = await this.prisma.pregunta.findMany({
      where: {
        estadoContenido: {
          in: [
            EstadoContenido.BORRADOR,
            EstadoContenido.EN_REVISION,
            EstadoContenido.PUBLICADO,
          ],
        },
        OR: [
          { huellaContenido: { in: fingerprints } },
          {
            huellaContenido: null,
            enunciado: { in: statements },
          },
        ],
      },
      select: {
        id: true,
        enunciado: true,
        imagenUrl: true,
        huellaContenido: true,
        estadoContenido: true,
        respuestas: { select: { texto: true } },
        subtema: {
          select: {
            tema: { select: { area: true } },
          },
        },
      },
    });
    const existingByFingerprint = new Map(
      existing.map((item) => [
        item.huellaContenido ??
          createQuestionFingerprint({
            area: item.subtema.tema.area,
            enunciado: item.enunciado,
            imagen: item.imagenUrl,
            opciones: item.respuestas.map((respuesta) => ({
              texto: respuesta.texto,
            })),
          }),
        item,
      ]),
    );
    for (const question of questions) {
      const match = existingByFingerprint.get(question.huella);
      if (!match) continue;
      question.posibleDuplicadoEnBase = true;
      question.coincidenciaEnBase = {
        id: match.id,
        estadoContenido: match.estadoContenido,
      };
      this.addError(
        issues,
        match.estadoContenido === EstadoContenido.PUBLICADO
          ? 'PREGUNTA_YA_PUBLICADA'
          : 'PREGUNTA_YA_REGISTRADA',
        match.estadoContenido === EstadoContenido.PUBLICADO
          ? 'Esta pregunta ya se encuentra publicada en el banco académico.'
          : `Esta pregunta ya existe en estado ${match.estadoContenido}. Revisa el registro existente en vez de importarla otra vez.`,
        'Preguntas',
        question.fila,
      );
    }
  }

  private getAssetIdentity(
    path: string | null,
    assets: Map<string, ContentPackageAsset>,
  ) {
    if (!path) return null;
    return (
      assets.get(path.toLocaleLowerCase('es-CO'))?.sha256 ??
      path.toLocaleLowerCase('es-CO')
    );
  }

  private validateClassificationNames(
    theme: string,
    subtheme: string,
    sheet: string,
    line: number,
    issues: IncidenciaImportacion[],
  ) {
    for (const [column, value] of [
      ['tema', theme],
      ['subtema', subtheme],
    ]) {
      if (!value) continue; // Required-field validation already reports this.
      try {
        validateCatalogName(value);
      } catch {
        this.addError(
          issues,
          'CLASIFICACION_INVALIDA',
          'Usa un nombre específico de 1 a 120 caracteres, sin caracteres invisibles ni Banco General.',
          sheet,
          line,
          column,
        );
      }
    }
  }

  private normalizeHeader(value: CellValue | undefined) {
    if (value === null || value === undefined || value instanceof Date)
      return '';
    return String(value)
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es-CO')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private hash(parts: string[]) {
    return createHash('sha256')
      .update(this.normalizeComparison(parts))
      .digest('hex');
  }

  private normalizeComparison(parts: string[]) {
    return parts
      .map((part) =>
        part
          .trim()
          .normalize('NFKC')
          .toLocaleLowerCase('es-CO')
          .replace(/\s+/g, ' '),
      )
      .join('\u001f');
  }

  private addError(
    issues: IncidenciaImportacion[],
    code: string,
    message: string,
    sheet: string,
    line: number,
    column?: string,
  ) {
    issues.push({
      severidad: 'ERROR',
      codigo: code,
      mensaje: message,
      hoja: sheet,
      fila: line,
      ...(column ? { columna: column } : {}),
    });
  }
}
