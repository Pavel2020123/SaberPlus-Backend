import { Logger, ServiceUnavailableException } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { CertificadoHtmlService } from './certificado-html.service';

jest.mock('puppeteer', () => ({ __esModule: true, default: { launch: jest.fn() } }));

describe('Renderizado de certificados con Puppeteer', () => {
  const datos = { nombre: 'Persona de prueba', area: 'Matemáticas', cursoCompleto: false, fecha: new Date('2026-09-20T12:00:00Z') };
  let service: CertificadoHtmlService;
  let page: any;
  let browser: any;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    page = {
      setJavaScriptEnabled: jest.fn().mockResolvedValue(undefined),
      setRequestInterception: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(), setContent: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(new Uint8Array(Buffer.from('%PDF-test'))),
    };
    const process = { kill: jest.fn() };
    browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn().mockResolvedValue(undefined), process: jest.fn(() => process) };
    (puppeteer.launch as jest.Mock).mockResolvedValue(browser);
    service = new CertificadoHtmlService();
  });
  afterEach(() => warn.mockRestore());

  it('mantiene opciones de lanzamiento, aislamiento de recursos y PDF A4 horizontal', async () => {
    expect(await service.generar(datos)).toEqual(Buffer.from('%PDF-test'));
    expect(puppeteer.launch).toHaveBeenCalledWith({ headless: true, timeout: 20_000 });
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(page.setRequestInterception).toHaveBeenCalledWith(true);
    expect(page.setContent).toHaveBeenCalledWith(expect.stringContaining(datos.nombre), { waitUntil: 'load', timeout: 10_000 });
    expect(page.pdf).toHaveBeenCalledWith({ format: 'A4', landscape: true, preferCSSPageSize: true, printBackground: true, timeout: 15_000 });
    const handler = page.on.mock.calls.find(([event]: [string]) => event === 'request')[1];
    for (const url of ['https://example.invalid', 'file:///private', 'data:text/html,test', 'data:image/png;base64,test']) {
      const request = { url: () => url, continue: jest.fn(), abort: jest.fn() };
      handler(request);
      expect(url.startsWith('data:image/png;base64,') ? request.continue : request.abort).toHaveBeenCalledTimes(1);
    }
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('traduce un fallo de lanzamiento y permite reintentar sin exponer detalles', async () => {
    (puppeteer.launch as jest.Mock).mockRejectedValueOnce(new Error('private executable path'));
    await expect(service.generar(datos)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private executable path');
    await expect(service.generar(datos)).resolves.toBeInstanceOf(Buffer);
  });

  it.each(['newPage', 'setContent', 'evaluate', 'pdf'])('cierra el navegador y libera el servicio si falla %s', async (method) => {
    (method === 'newPage' ? browser : page)[method].mockRejectedValueOnce(new Error('render failure'));
    await expect(service.generar(datos)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(browser.close).toHaveBeenCalledTimes(1);
    await expect(service.generar(datos)).resolves.toBeInstanceOf(Buffer);
  });

  it('fuerza el cierre del proceso si browser.close falla y libera el servicio', async () => {
    browser.close.mockRejectedValueOnce(new Error('close failure'));
    await expect(service.generar(datos)).resolves.toBeInstanceOf(Buffer);
    expect(browser.process().kill).toHaveBeenCalledTimes(1);
    await expect(service.generar(datos)).resolves.toBeInstanceOf(Buffer);
  });

  it('rechaza renderizados concurrentes sin lanzar un segundo navegador', async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    page.pdf.mockImplementationOnce(() => { started(); return new Promise<Buffer>((resolve) => { release = () => resolve(Buffer.from('%PDF-test')); }); });
    const first = service.generar(datos);
    await ready;
    await expect(service.generar(datos)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
