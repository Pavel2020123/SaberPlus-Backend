import { Injectable, NotFoundException } from '@nestjs/common';
// PDFKit usa `export =` y este proyecto CommonJS no habilita esModuleInterop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { ESTADO_PUBLICADO } from '../common/contenido-publicado';

const AREA_NOMBRES: Record<string, string> = {
  LECTURA_CRITICA: 'Lectura Crítica',
  MATEMATICAS: 'Matemáticas',
  CIENCIAS_NATURALES: 'Ciencias Naturales',
  SOCIALES_CIUDADANAS: 'Sociales y Ciudadanas',
  INGLES: 'Inglés',
};

function textoCompatiblePdf(texto: string) {
  return texto
    .replace(/🎯/gu, 'Objetivo: ')
    .replace(/✅/gu, '[Correcto] ')
    .replace(/❌/gu, '[Incorrecto] ')
    .replace(/💡/gu, 'Consejo: ')
    .replace(/⚠️?/gu, 'Atención: ')
    .replace(/[🀀-🫿]/gu, '')
    .replace(/[︎️]/gu, '');
}

export function limpiarMarkdownEnLinea(texto: string) {
  return textoCompatiblePdf(texto)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([#*_`>-])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function nombreArchivoSeguro(nombre: string) {
  const normalizado = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return `tema-${normalizado || 'icfes'}.pdf`;
}

function agregarEtiquetaBloque(doc: PDFKit.PDFDocument, linea: string) {
  const tipo = linea.match(/tipo="([^"]+)"/i)?.[1];
  if (!tipo) return;
  doc.moveDown(0.35);
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#146C94')
    .text(tipo.toUpperCase(), { characterSpacing: 0.6 });
  doc.moveDown(0.25);
}

function renderizarMarkdown(doc: PDFKit.PDFDocument, contenido: string) {
  const lineas = contenido.replace(/\r\n?/g, '\n').split('\n');
  let indice = 0;

  while (indice < lineas.length) {
    const lineaOriginal = lineas[indice].trim();

    if (!lineaOriginal) {
      doc.moveDown(0.35);
      indice++;
      continue;
    }

    if (/^\[\[LECCION\b/i.test(lineaOriginal)) {
      indice++;
      continue;
    }
    if (/^\[\[BLOQUE\b/i.test(lineaOriginal)) {
      agregarEtiquetaBloque(doc, lineaOriginal);
      indice++;
      continue;
    }

    const encabezado = lineaOriginal.match(/^(#{1,3})\s+(.+)$/);
    if (encabezado) {
      const nivel = encabezado[1].length;
      const tamanos = [20, 16, 13];
      doc
        .moveDown(nivel === 1 ? 0.5 : 0.3)
        .font('Helvetica-Bold')
        .fontSize(tamanos[nivel - 1])
        .fillColor(nivel === 1 ? '#14394C' : '#146C94')
        .text(limpiarMarkdownEnLinea(encabezado[2]), {
          lineGap: 2,
          paragraphGap: 5,
        });
      indice++;
      continue;
    }

    const lista = lineaOriginal.match(/^[-*+]\s+(.+)$/);
    const listaNumerada = lineaOriginal.match(/^\d+[.)]\s+(.+)$/);
    if (lista || listaNumerada) {
      const marcador = listaNumerada
        ? `${lineaOriginal.match(/^\d+/)?.[0]}.`
        : '•';
      const texto = limpiarMarkdownEnLinea((lista ?? listaNumerada)?.[1] ?? '');
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor('#263B46')
        .text(`${marcador}  ${texto}`, { indent: 12, lineGap: 2 });
      indice++;
      continue;
    }

    if (/^>\s?/.test(lineaOriginal)) {
      doc
        .font('Helvetica-Oblique')
        .fontSize(10.5)
        .fillColor('#506773')
        .text(limpiarMarkdownEnLinea(lineaOriginal.replace(/^>\s?/, '')), {
          indent: 16,
          lineGap: 2,
        });
      indice++;
      continue;
    }

    if (lineaOriginal.includes('|')) {
      const celdas = lineaOriginal
        .split('|')
        .map((celda) => limpiarMarkdownEnLinea(celda))
        .filter(Boolean);
      if (
        celdas.length > 0 &&
        !celdas.every((celda) => /^:?-{3,}:?$/.test(celda))
      ) {
        doc
          .font('Helvetica')
          .fontSize(9.5)
          .fillColor('#263B46')
          .text(celdas.join('  |  '), { lineGap: 2 });
      }
      indice++;
      continue;
    }

    const parrafo = [lineaOriginal];
    while (indice + 1 < lineas.length) {
      const siguiente = lineas[indice + 1].trim();
      if (
        !siguiente ||
        /^(#{1,3})\s+/.test(siguiente) ||
        /^\[\[(?:LECCION|BLOQUE)\b/i.test(siguiente) ||
        /^[-*+]\s+/.test(siguiente) ||
        /^\d+[.)]\s+/.test(siguiente) ||
        /^>\s?/.test(siguiente) ||
        siguiente.includes('|')
      ) {
        break;
      }
      parrafo.push(siguiente);
      indice++;
    }

    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor('#263B46')
      .text(limpiarMarkdownEnLinea(parrafo.join(' ')), {
        align: 'justify',
        lineGap: 3,
        paragraphGap: 6,
      });
    indice++;
  }
}

function agregarImagenLocal(doc: PDFKit.PDFDocument, imagenUrl: string | null) {
  if (!imagenUrl) return;
  if (/^https?:\/\//i.test(imagenUrl)) {
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#146C94')
      .text(`Recurso visual: ${imagenUrl}`, {
        link: imagenUrl,
        underline: true,
      });
    return;
  }

  const archivo = basename(imagenUrl);
  const ruta = join(
    process.cwd(),
    '..',
    'frontend',
    'public',
    'imagenes',
    archivo,
  );
  if (!existsSync(ruta)) return;

  try {
    const imagen = readFileSync(ruta);
    if (doc.y > doc.page.height - 280) doc.addPage();
    doc.image(imagen, { fit: [470, 230], align: 'center' });
    doc.moveDown(0.6);
  } catch {
    // Un recurso visual inválido no debe impedir la descarga del contenido.
  }
}

@Injectable()
export class TemaPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generarPdfTema(temaId: string) {
    const tema = await this.prisma.tema.findFirst({
      where: { id: temaId, estadoContenido: ESTADO_PUBLICADO },
      include: {
        subtemas: {
          where: { estadoContenido: ESTADO_PUBLICADO },
          orderBy: { nombre: 'asc' },
        },
      },
    });
    if (!tema) throw new NotFoundException('El tema no existe.');

    const archivo = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 48, right: 54, bottom: 54, left: 54 },
        bufferPages: true,
        info: {
          Title: `${tema.nombre} - SaberPlus`,
          Author: 'SaberPlus',
          Subject: `Material de estudio de ${AREA_NOMBRES[tema.area] ?? tema.area}`,
        },
      });
      const partes: Buffer[] = [];
      doc.on('data', (parte: Buffer) => partes.push(parte));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(partes)));

      doc.rect(0, 0, doc.page.width, 138).fill('#146C94');
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#BDEBFA')
        .text(AREA_NOMBRES[tema.area] ?? tema.area, 54, 36);
      doc
        .font('Helvetica-Bold')
        .fontSize(25)
        .fillColor('#FFFFFF')
        .text(textoCompatiblePdf(tema.nombre), 54, 59, {
          width: doc.page.width - 108,
          lineGap: 3,
        });
      doc.y = 166;

      if (tema.subtemas.length === 0) {
        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor('#506773')
          .text('Este tema todavía no tiene subtemas publicados.');
      }

      tema.subtemas.forEach((subtema, indice) => {
        if (indice > 0) doc.addPage();
        doc
          .font('Helvetica-Bold')
          .fontSize(17)
          .fillColor('#14394C')
          .text(`${indice + 1}. ${textoCompatiblePdf(subtema.nombre)}`, {
            lineGap: 2,
          });
        doc
          .moveDown(0.3)
          .strokeColor('#19A7CE')
          .lineWidth(2)
          .moveTo(doc.x, doc.y)
          .lineTo(doc.page.width - 54, doc.y)
          .stroke();
        doc.moveDown(0.8);

        agregarImagenLocal(doc, subtema.imagenUrl);
        if (subtema.contenido?.trim()) {
          renderizarMarkdown(doc, subtema.contenido);
        } else {
          doc
            .font('Helvetica-Oblique')
            .fontSize(10.5)
            .fillColor('#71818A')
            .text('Contenido pendiente de publicación.');
        }
        if (subtema.videoUrl?.trim()) {
          doc.moveDown(0.6);
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#146C94')
            .text(`Video de apoyo: ${subtema.videoUrl}`, {
              link: subtema.videoUrl,
              underline: true,
            });
        }
      });

      const paginas = doc.bufferedPageRange();
      for (let i = paginas.start; i < paginas.start + paginas.count; i++) {
        doc.switchToPage(i);
        const margenInferior = doc.page.margins.bottom;
        const textoPie = `SaberPlus  |  Material de estudio  |  Página ${i + 1} de ${paginas.count}`;
        doc.page.margins.bottom = 0;
        doc.font('Helvetica').fontSize(8).fillColor('#71818A');
        const anchoPie = doc.widthOfString(textoPie);
        doc.text(
          textoPie,
          (doc.page.width - anchoPie) / 2,
          doc.page.height - 34,
          { lineBreak: false },
        );
        doc.page.margins.bottom = margenInferior;
      }

      doc.end();
    });

    return { archivo, nombre: nombreArchivoSeguro(tema.nombre) };
  }
}
