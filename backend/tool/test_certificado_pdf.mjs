// Ejecutar después de npm run build: node tool/test_certificado_pdf.mjs
// Usa Chrome real, assets incluidos y datos ficticios; no requiere base de datos.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import renderer from '../dist/gamificacion/certificado-html.service.js';

const browsers = [];
const launch = puppeteer.launch.bind(puppeteer);
puppeteer.launch = async (options) => {
  const browser = await launch(options);
  browsers.push(browser);
  return browser;
};

try {
  const executable = await puppeteer.executablePath();
  assert.ok(existsSync(executable), 'El ejecutable configurado debe existir');
  const service = new renderer.CertificadoHtmlService();
  const areas = ['Matemáticas', 'Lectura crítica', 'Sociales y ciudadanas', 'Ciencias naturales', 'Inglés', 'Curso completo'];
  for (const [index, area] of areas.entries()) {
    const pdf = await service.generar({
      nombre: index === 5 ? 'Nombre de prueba largo para comprobar el ajuste del certificado completo' : 'Persona de prueba',
      area, cursoCompleto: index === 5, fecha: new Date('2026-09-20T12:00:00Z'),
    });
    assert.ok(Buffer.isBuffer(pdf));
    assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
    assert.ok(pdf.subarray(-32).toString().includes('%%EOF'));
    assert.ok(pdf.length > 10_000, 'PDF con contenido y assets');
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1, 'Un certificado por página');
    const browser = browsers.at(-1);
    assert.equal(browser.connected, false, 'La conexión debe cerrarse');
    assert.ok(browser.process()?.exitCode !== null || browser.process()?.signalCode !== null, 'Chrome debe terminar');
    console.log(`PASS ${area}: PDF de una página, ${pdf.length} bytes; Chrome cerrado`);
  }
  assert.equal(browsers.length, 6);
} finally {
  puppeteer.launch = launch;
  await Promise.all(browsers.filter((browser) => browser.connected).map((browser) => browser.close()));
}
