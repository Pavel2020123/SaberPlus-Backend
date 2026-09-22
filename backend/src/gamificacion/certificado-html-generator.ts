import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';

export type AreaCertificado =
  | 'LECTURA_CRITICA'
  | 'MATEMATICAS'
  | 'CIENCIAS_NATURALES'
  | 'SOCIALES_CIUDADANAS'
  | 'INGLES';

export type TipoCertificado = AreaCertificado | 'CURSO_COMPLETO';

const NOMBRE_AREA: Record<AreaCertificado, string> = {
  LECTURA_CRITICA: 'Lectura crítica',
  MATEMATICAS: 'Matemáticas',
  CIENCIAS_NATURALES: 'Ciencias naturales',
  SOCIALES_CIUDADANAS: 'Sociales y ciudadanas',
  INGLES: 'Inglés',
};

export interface DatosCertificado {
  /** Nombre completo del estudiante, tal como está en Usuario.nombre. */
  nombreEstudiante: string;
  tipo: TipoCertificado;
  fecha: Date;
  /** true para cualquier muestra con datos ficticios; nunca true en emisión real. */
  demo: boolean;
}

export class DatosCertificadoInvalidosError extends Error {}

const RUTA_PLANTILLA = path.join(__dirname, 'certificado.template.html');

function imagenComoDataUri(nombre: string): string {
  const bytes = fs.readFileSync(path.join(__dirname, 'assets', nombre));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function validar(data: DatosCertificado): void {
  if (!data.nombreEstudiante || !data.nombreEstudiante.trim()) {
    throw new DatosCertificadoInvalidosError(
      'No se puede generar el certificado: falta el nombre del estudiante (Usuario.nombre).',
    );
  }
  if (data.nombreEstudiante.trim().length > 120) {
    throw new DatosCertificadoInvalidosError(
      'El nombre del estudiante es demasiado largo para generar el certificado.',
    );
  }
  const tiposValidos: TipoCertificado[] = [
    'LECTURA_CRITICA',
    'MATEMATICAS',
    'CIENCIAS_NATURALES',
    'SOCIALES_CIUDADANAS',
    'INGLES',
    'CURSO_COMPLETO',
  ];
  if (!tiposValidos.includes(data.tipo)) {
    throw new DatosCertificadoInvalidosError(`Tipo de certificado no reconocido: ${data.tipo}`);
  }
}

/** Evita que el nombre del estudiante rompa el HTML (caracteres &, <, >). */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function textoCertificado(data: DatosCertificado, nombreEscapado: string): string {
  if (data.tipo === 'CURSO_COMPLETO') {
    return `SaberPlus felicita a ${nombreEscapado} por haber completado las cinco áreas del curso de preparación para Saber 11 de SaberPlus.`;
  }
  const area = NOMBRE_AREA[data.tipo as AreaCertificado];
  return `SaberPlus felicita a ${nombreEscapado} por haber completado el área de ${area} de su programa de preparación para Saber 11.`;
}

function tituloCertificado(data: DatosCertificado): string {
  return data.tipo === 'CURSO_COMPLETO'
    ? 'Constancia de finalización del curso'
    : 'Constancia de finalización de área';
}

function areaOCursoTexto(data: DatosCertificado): string {
  return data.tipo === 'CURSO_COMPLETO' ? 'Curso completo' : NOMBRE_AREA[data.tipo as AreaCertificado];
}

function formatearFecha(fecha: Date): string {
  // En UTC a propósito: la fecha representa un día de calendario, no un
  // instante. Formatear con otra zona horaria puede correr el día hacia
  // atrás si el Date viene de algo como `new Date('2026-09-19')`.
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(fecha);
}

/**
 * Tamaño de fuente del nombre en px, según su largo. Puppeteer no mide
 * texto como PDFKit, así que aquí se hace por rangos de caracteres en vez
 * de medir el ancho real; los rangos están pensados para el ancho
 * disponible de la plantilla (1123px - 182px de márgenes = 941px).
 */
function tamanoFuenteNombre(nombre: string): number {
  const largo = nombre.trim().length;
  if (largo <= 22) return 40;
  if (largo <= 32) return 33;
  if (largo <= 42) return 27;
  return 21;
}

function llenarPlantilla(data: DatosCertificado): string {
  const plantilla = fs.readFileSync(RUTA_PLANTILLA, 'utf-8');
  const nombreEscapado = escaparHtml(data.nombreEstudiante.trim());

  const valores: Record<string, string> = {
    NOMBRE_STYLE: `style="font-size: ${tamanoFuenteNombre(data.nombreEstudiante)}px;"`,
    BODY_CLASS: data.demo ? 'demo' : '',
    TITULO: tituloCertificado(data),
    NOMBRE: nombreEscapado,
    TEXTO: textoCertificado(data, nombreEscapado),
    AREA_O_CURSO: areaOCursoTexto(data),
    FECHA: formatearFecha(data.fecha),
    LOGO_SRC: imagenComoDataUri('logo-saberplus.png'),
    SABI_SRC: imagenComoDataUri('sabi-celebracion.png'),
  };

    return plantilla.replace(/\{\{(\w+)\}\}/g, (_, k) => valores[k] ?? '');
}


export async function generarCertificadoPdf(data: DatosCertificado): Promise<Buffer> {
  validar(data);
  const html = llenarPlantilla(data);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    
    await page.setViewport({ width: 1123, height: 794 });
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      width: '1123px',
      height: '794px',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}


export function nombreArchivoCertificado(data: DatosCertificado): string {
  const areaSlug = data.tipo === 'CURSO_COMPLETO' ? 'curso-completo' : NOMBRE_AREA[data.tipo as AreaCertificado];

  const normalizar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

  return `certificado-${normalizar(areaSlug)}-${normalizar(data.nombreEstudiante)}.pdf`;
}
