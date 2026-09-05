import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
// PDFKit usa `export =` en este proyecto CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { GamificacionService } from './gamificacion.service';

function nombreArchivoSeguro(nombre: string) {
  const normalizado = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `certificado-${normalizado || 'logro'}.pdf`;
}

@Injectable()
export class CertificadoLogroService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamificacion: GamificacionService,
  ) {}

  async generar(usuarioId: string, logroId: string) {
    const [usuario, logro] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { nombre: true },
      }),
      this.gamificacion.obtenerLogroDesbloqueado(usuarioId, logroId),
    ]);
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');

    const emitido = new Date();
    const fecha = new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(emitido);
    const folio = createHash('sha256')
      .update(`${usuarioId}:${logroId}`)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();

    const archivo = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        layout: 'landscape',
        margin: 0,
        info: {
          Title: `${logro.titulo} - SaberPlus`,
          Author: 'SaberPlus',
          Subject: 'Certificado de logro académico',
        },
      });
      const partes: Buffer[] = [];
      doc.on('data', (parte: Buffer) => partes.push(parte));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(partes)));

      const ancho = doc.page.width;
      const alto = doc.page.height;
      doc.rect(0, 0, ancho, alto).fill('#F5F8F9');
      doc
        .rect(18, 18, ancho - 36, alto - 36)
        .lineWidth(3)
        .stroke('#146C94');
      doc
        .rect(26, 26, ancho - 52, alto - 52)
        .lineWidth(1)
        .stroke('#9CCCDD');
      doc.rect(0, 0, 18, alto).fill('#146C94');

      doc.circle(ancho / 2, 123, 48).fill('#146C94');
      doc
        .circle(ancho / 2, 123, 38)
        .lineWidth(2)
        .stroke('#8DD8FF');
      doc
        .font('Helvetica-Bold')
        .fontSize(30)
        .fillColor('#FFFFFF')
        .text('SP', ancho / 2 - 35, 105, { width: 70, align: 'center' });

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#146C94')
        .text('SABERPLUS RECONOCE ESTE LOGRO', 70, 188, {
          width: ancho - 140,
          align: 'center',
          characterSpacing: 1.2,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(32)
        .fillColor('#172D38')
        .text(usuario.nombre, 80, 220, { width: ancho - 160, align: 'center' });
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor('#58707C')
        .text('por alcanzar la insignia', 80, 269, {
          width: ancho - 160,
          align: 'center',
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(25)
        .fillColor('#146C94')
        .text(logro.titulo, 80, 297, { width: ancho - 160, align: 'center' });
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#536A75')
        .text(logro.descripcion, 125, 341, {
          width: ancho - 250,
          align: 'center',
        });

      doc.moveTo(95, 432).lineTo(285, 432).lineWidth(1).stroke('#8BA3AE');
      doc
        .moveTo(ancho - 285, 432)
        .lineTo(ancho - 95, 432)
        .stroke('#8BA3AE');
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#253C47')
        .text('SaberPlus', 95, 441, { width: 190, align: 'center' });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#687D87')
        .text(`Emitido el ${fecha}`, ancho - 285, 441, {
          width: 190,
          align: 'center',
        });
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#7A8D96')
        .text(`Folio SP-${folio}`, 80, alto - 51, {
          width: ancho - 160,
          align: 'center',
        });
      doc.end();
    });

    return { archivo, nombre: nombreArchivoSeguro(logro.titulo) };
  }
}
