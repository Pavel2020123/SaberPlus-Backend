import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CertificadoCursoService } from './certificado-curso.service';
import {
  DatosCertificadoInvalidosError,
  generarCertificadoPdf,
} from './certificado-html-generator';

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

jest.mock('./certificado-html-generator', () => ({
  ...jest.requireActual('./certificado-html-generator'),
  generarCertificadoPdf: jest.fn(),
}));

const generarPdfMock = generarCertificadoPdf as jest.Mock;

const AREAS = [
  'LECTURA_CRITICA',
  'MATEMATICAS',
  'CIENCIAS_NATURALES',
  'SOCIALES_CIUDADANAS',
  'INGLES',
];

type Fila = { tema: { area: string }; progresotemas: { id: string }[] };

function fila(area: string, completado: boolean): Fila {
  return { tema: { area }, progresotemas: completado ? [{ id: 'p' }] : [] };
}

function areasCompletas(areas: string[]): Fila[] {
  return areas.flatMap((area) => [fila(area, true), fila(area, true)]);
}

function crear(
  subtemas: Fila[],
  usuario: { nombre: string } | null = { nombre: 'Juan Pérez' },
) {
  const prisma = {
    subtema: { findMany: jest.fn().mockResolvedValue(subtemas) },
    usuario: { findUnique: jest.fn().mockResolvedValue(usuario) },
  };
  return { service: new CertificadoCursoService(prisma as never), prisma };
}

describe('CertificadoCursoService', () => {
  beforeEach(() => {
    generarPdfMock.mockReset();
    generarPdfMock.mockResolvedValue(Buffer.from('pdf'));
  });

  describe('listar', () => {
    it('devuelve seis tipos y todos bloqueados sin contenido publicado', async () => {
      const { service } = crear([]);
      const { certificados } = await service.listar('u1');
      expect(certificados.map((c) => c.tipo)).toEqual([...AREAS, 'CURSO_COMPLETO']);
      expect(certificados.every((c) => !c.disponible)).toBe(true);
    });

    it('habilita un área solo si todos sus subtemas publicados están completados', async () => {
      const { service } = crear([
        fila('MATEMATICAS', true),
        fila('MATEMATICAS', true),
        fila('INGLES', true),
        fila('INGLES', false),
      ]);
      const { certificados } = await service.listar('u1');
      const mate = certificados.find((c) => c.tipo === 'MATEMATICAS');
      const ingles = certificados.find((c) => c.tipo === 'INGLES');
      expect(mate).toMatchObject({ disponible: true, completados: 2, total: 2 });
      expect(ingles).toMatchObject({ disponible: false, completados: 1, total: 2 });
    });

    it('el curso completo no se habilita con cuatro áreas', async () => {
      const { service } = crear(areasCompletas(AREAS.slice(0, 4)));
      const { certificados } = await service.listar('u1');
      expect(certificados.find((c) => c.tipo === 'CURSO_COMPLETO')).toMatchObject({
        disponible: false,
        completados: 4,
        total: 5,
      });
    });

    it('el curso completo se habilita con las cinco áreas', async () => {
      const { service } = crear(areasCompletas(AREAS));
      const { certificados } = await service.listar('u1');
      expect(certificados.every((c) => c.disponible)).toBe(true);
    });

    it('consulta el progreso solo del usuario autenticado', async () => {
      const { service, prisma } = crear([]);
      await service.listar('u1');
      const consulta = JSON.stringify(prisma.subtema.findMany.mock.calls[0][0]);
      expect(consulta).toContain('"usuarioId":"u1"');
    });
  });

  describe('generarPdf', () => {
    it('rechaza un tipo desconocido sin generar PDF', async () => {
      const { service } = crear(areasCompletas(AREAS));
      await expect(service.generarPdf('u1', 'OTRO')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(generarPdfMock).not.toHaveBeenCalled();
    });

    it('falla si el usuario no existe', async () => {
      const { service } = crear(areasCompletas(AREAS), null);
      await expect(service.generarPdf('u1', 'MATEMATICAS')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('bloquea un área no completada', async () => {
      const { service } = crear([fila('MATEMATICAS', false)]);
      await expect(service.generarPdf('u1', 'MATEMATICAS')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(generarPdfMock).not.toHaveBeenCalled();
    });

    it('bloquea el curso completo con menos de cinco áreas', async () => {
      const { service } = crear(areasCompletas(AREAS.slice(0, 4)));
      await expect(service.generarPdf('u1', 'CURSO_COMPLETO')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(generarPdfMock).not.toHaveBeenCalled();
    });

    it('genera el PDF real con el nombre del usuario y sin marca de demostración', async () => {
      const { service } = crear(areasCompletas(AREAS));
      const resultado = await service.generarPdf('u1', 'MATEMATICAS');
      expect(generarPdfMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nombreEstudiante: 'Juan Pérez',
          tipo: 'MATEMATICAS',
          demo: false,
          fecha: expect.any(Date),
        }),
      );
      expect(resultado.nombre).toBe('certificado-matematicas-juan-perez.pdf');
      expect(resultado.archivo.toString()).toBe('pdf');
    });

    it('convierte un nombre inválido en un error 422 accionable', async () => {
      generarPdfMock.mockRejectedValue(
        new DatosCertificadoInvalidosError('falta el nombre'),
      );
      const { service } = crear(areasCompletas(AREAS), { nombre: '   ' });
      await expect(service.generarPdf('u1', 'MATEMATICAS')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
  });
});