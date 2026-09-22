import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer, { Browser } from 'puppeteer';

export interface DatosCertificado {
  nombre: string;
  area: string;
  cursoCompleto: boolean;
  fecha: Date;
  demostracion?: boolean;
}

export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

export async function construirHtml(datos: DatosCertificado): Promise<string> {
  const carpeta = join(__dirname, 'templates');
  const [plantilla, logo, mascota] = await Promise.all([
    readFile(join(carpeta, 'certificado.html'), 'utf8'),
    readFile(join(carpeta, 'logo-saberplus.png')),
    readFile(join(carpeta, 'sabi-celebracion.png')),
  ]);
  const valores: Record<string, string> = {
    BODY_CLASS: datos.demostracion ? 'demo' : '',
    TITULO: datos.cursoCompleto ? 'Certificado de curso completo' : 'Certificado de finalización de área',
    NOMBRE: escaparHtml(datos.nombre),
    AREA_O_CURSO: escaparHtml(datos.area),
    TEXTO: datos.cursoCompleto
      ? 'Por completar las cinco áreas del curso de preparación para Saber 11 de SaberPlus.'
      : 'Por completar todas las lecciones publicadas del área en el programa de preparación para Saber 11 de SaberPlus.',
    FECHA: new Intl.DateTimeFormat('es-CO', {
      timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
    }).format(datos.fecha),
    LOGO: `data:image/png;base64,${logo.toString('base64')}`,
    MASCOTA: `data:image/png;base64,${mascota.toString('base64')}`,
  };
  return plantilla.replace(/\{\{([A-Z_]+)\}\}/g, (_, clave: string) => {
    if (!(clave in valores)) throw new Error('Variable de plantilla desconocida.');
    return valores[clave];
  });
}

@Injectable()
export class CertificadoHtmlService {
  private ocupado = false;
  private readonly logger = new Logger(CertificadoHtmlService.name);

  async generar(datos: DatosCertificado): Promise<Buffer> {
    // Bound resource use on small instances; no unbounded render queue.
    if (this.ocupado) throw new ServiceUnavailableException('Se está preparando otro certificado. Intenta nuevamente en unos segundos.');
    this.ocupado = true;
    let browser: Browser | undefined;
    try {
      const html = await construirHtml(datos);
      browser = await puppeteer.launch({ headless: true, timeout: 20_000 });
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Only bundled data images. Never fetch user URLs, remote fonts or local files.
        void (request.url().startsWith('data:image/png;base64,')
          ? request.continue() : request.abort());
      });
      await page.setContent(html, { waitUntil: 'load', timeout: 10_000 });
      await page.evaluate(async () => {
        await Promise.all(Array.from(document.images).map((image) => image.decode()));
        const nombre = document.querySelector<HTMLElement>('.name')!;
        let tamano = 42;
        while (nombre.scrollHeight > 112 && tamano > 12) nombre.style.fontSize = `${--tamano}px`;
        if (nombre.scrollHeight > 112) throw new Error('Nombre fuera del espacio disponible.');
      });
      return Buffer.from(await page.pdf({
        format: 'A4', landscape: true, preferCSSPageSize: true,
        printBackground: true, timeout: 15_000,
      }));
    } catch {
      // Do not log HTML, the student's name, executable paths or credentials.
      this.logger.warn('No se pudo renderizar el certificado HTML. Verificar navegador y assets del servidor.');
      throw new ServiceUnavailableException('No pudimos preparar el PDF. Intenta nuevamente más tarde.');
    } finally {
      try {
        await browser?.close();
      } catch {
        browser?.process()?.kill();
        this.logger.warn('El proceso de renderizado necesitó cierre forzado.');
      } finally { this.ocupado = false; }
    }
  }
}
