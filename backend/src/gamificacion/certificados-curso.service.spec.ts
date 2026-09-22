import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificadoHtmlService, construirHtml, escaparHtml } from './certificado-html.service';
import { AREAS_CERTIFICADO, CertificadosCursoService, nombreCertificado } from './certificados-curso.service';
import { GamificacionController } from './gamificacion.controller';
import { GamificacionService } from './gamificacion.service';

describe('Certificados de áreas y curso', () => {
  const subtema = { findMany: jest.fn() };
  const usuario = { findUnique: jest.fn() };
  const html = { generar: jest.fn() };
  const service = new CertificadosCursoService({ subtema, usuario } as unknown as PrismaService, html as unknown as CertificadoHtmlService);
  const leccion = (area: string, completada: boolean) => ({ tema: { area }, progresotemas: completada ? [{ id: 'progreso' }] : [] });

  beforeEach(() => {
    jest.resetAllMocks();
    subtema.findMany.mockResolvedValue([]);
    usuario.findUnique.mockResolvedValue({ nombre: 'Juanito Pérez' });
    html.generar.mockResolvedValue(Buffer.from('%PDF-muestra'));
  });

  it('devuelve exactamente seis y no habilita áreas vacías', async () => {
    const lista = await service.listar('usuario-1');
    expect(lista).toHaveLength(6);
    expect(lista.every((item) => !item.disponible)).toBe(true);
    expect(lista[5]).toMatchObject({ id: 'CURSO_COMPLETO', total: 5, completadas: 0 });
  });

  it('requiere TODAS las lecciones, no preguntas acertadas ni logros', async () => {
    subtema.findMany.mockResolvedValue([leccion('MATEMATICAS', true), leccion('MATEMATICAS', false), leccion('INGLES', true)]);
    const lista = await service.listar('usuario-1');
    expect(lista.find((item) => item.id === 'MATEMATICAS')).toMatchObject({ total: 2, completadas: 1, disponible: false });
    expect(lista.find((item) => item.id === 'INGLES')?.disponible).toBe(true);
    expect(lista[5].disponible).toBe(false);
  });

  it('exige las cinco áreas, no cuatro ni sus descargas', async () => {
    subtema.findMany.mockResolvedValue(AREAS_CERTIFICADO.slice(0, 4).map((area) => leccion(area.id, true)));
    expect((await service.listar('usuario-1'))[5].disponible).toBe(false);
    subtema.findMany.mockResolvedValue(AREAS_CERTIFICADO.map((area) => leccion(area.id, true)));
    expect((await service.listar('usuario-1'))[5].disponible).toBe(true);
  });

  it('filtra publicaciones de padres y subtemas y progreso de la cuenta autenticada', async () => {
    await service.listar('usuario-1');
    expect(subtema.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AND: [{ estadoContenido: 'PUBLICADO' }, { tema: { estadoContenido: 'PUBLICADO' } }, {}] },
      select: expect.objectContaining({ progresotemas: {
        where: { usuarioId: 'usuario-1', completado: true, porcentaje: { gte: 100 } }, select: { id: true },
      } }),
    }));
  });

  it('rechaza IDs de logros, traversal y certificados pendientes antes de renderizar', async () => {
    for (const id of ['PRIMER_PASO', '../../etc/passwd', 'RACHA_7']) {
      await expect(service.generar('usuario-1', id)).rejects.toBeInstanceOf(NotFoundException);
    }
    await expect(service.generar('usuario-1', 'MATEMATICAS')).rejects.toBeInstanceOf(ForbiddenException);
    expect(html.generar).not.toHaveBeenCalled();
  });

  it('toma el nombre íntegro de la cuenta y sanea solamente el nombre de archivo', async () => {
    subtema.findMany.mockResolvedValue([leccion('MATEMATICAS', true)]);
    usuario.findUnique.mockResolvedValue({ nombre: 'Juan David Ospino Pérez' });
    const result = await service.generar('usuario-1', 'MATEMATICAS');
    expect(usuario.findUnique).toHaveBeenCalledWith({ where: { id: 'usuario-1' }, select: { nombre: true } });
    expect(html.generar).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Juan David Ospino Pérez', area: 'Matemáticas', cursoCompleto: false }));
    expect(result.nombre).toBe('certificado-matematicas-juan-david-ospino-perez.pdf');
    expect(nombreCertificado('../Ána\r\n"', 'INGLES')).toBe('certificado-ingles-ana.pdf');
  });

  it('reevalúa al publicar una lección nueva', async () => {
    subtema.findMany.mockResolvedValueOnce([leccion('INGLES', true)]).mockResolvedValueOnce([leccion('INGLES', true), leccion('INGLES', false)]);
    await service.generar('usuario-1', 'INGLES');
    await expect(service.generar('usuario-1', 'INGLES')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no genera certificados sin nombre de perfil', async () => {
    subtema.findMany.mockResolvedValue([leccion('INGLES', true)]);
    usuario.findUnique.mockResolvedValue({ nombre: '  ' });
    await expect(service.generar('usuario-1', 'INGLES')).rejects.toThrow('Completa tu nombre');
    expect(html.generar).not.toHaveBeenCalled();
  });

  it('retira con 410 la ruta anterior de logros', () => {
    const controller = new GamificacionController({} as GamificacionService, service);
    expect(() => controller.certificadoDeLogroRetirado()).toThrow(GoneException);
  });

  it('escapa nombres como texto y no deja URLs externas ni variables pendientes', async () => {
    const nombre = '<img src="https://evil.test"> O\'Pérez & {{LOGO}}';
    const result = await construirHtml({ nombre, area: 'Matemáticas', cursoCompleto: false, fecha: new Date('2026-09-20T12:00:00Z'), demostracion: true });
    expect(result).toContain(escaparHtml(nombre));
    expect(result).not.toContain('<img src="https://evil.test">');
    expect(result).toContain('body class="demo"');
    expect(result).toContain('20 de septiembre de 2026');
    expect(result.match(/src="data:image\/png;base64,/g)).toHaveLength(2);
    expect(result).not.toContain('{{NOMBRE}}');
  });
});
