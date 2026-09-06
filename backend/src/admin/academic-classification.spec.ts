import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from '../auth/jwt.guard';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { ContentLifecycleService } from './content-lifecycle.service';
import {
  AcademicCatalogController,
  CatalogThemesDto,
} from './academic-catalog.controller';

describe('Clasificación obligatoria', () => {
  const subtema = { findUnique: jest.fn(), update: jest.fn() };
  const pregunta = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { subtema, pregunta } as unknown as PrismaService;
  const service = new AdminService(prisma);
  const lifecycle = new ContentLifecycleService(prisma);
  const valid = () => ({
    nombre: 'Regla de tres',
    estadoContenido: 'PUBLICADO',
    tema: {
      nombre: 'Proporcionalidad',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO',
    },
  });
  const respuestas = [
    { texto: '4', esCorrecta: true },
    { texto: '5', esCorrecta: false },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    subtema.findUnique.mockResolvedValue(valid());
    pregunta.findFirst.mockResolvedValue(null);
  });

  it.each(['subtema', 'tema'])(
    'rechaza preguntas de Banco General en %s',
    async (level) => {
      const data = valid();
      if (level === 'tema') data.tema.nombre = 'Banco General';
      else data.nombre = 'Banco General';
      subtema.findUnique.mockResolvedValue(data);
      await expect(
        service.crearPregunta('Pregunta', 's1', 'MEDIO', respuestas),
      ).rejects.toThrow('Banco General');
      expect(pregunta.create).not.toHaveBeenCalled();
    },
  );

  it.each(['subtema', 'tema'])(
    'rechaza preguntas con %s archivado',
    async (level) => {
      const data = valid();
      if (level === 'tema') data.tema.estadoContenido = 'ARCHIVADO';
      else data.estadoContenido = 'ARCHIVADO';
      subtema.findUnique.mockResolvedValue(data);
      await expect(
        service.crearPregunta('Pregunta', 's1', 'MEDIO', respuestas),
      ).rejects.toThrow('archivados');
      expect(pregunta.create).not.toHaveBeenCalled();
    },
  );

  it('permite cargar preguntas específicas de un catálogo todavía en borrador', async () => {
    subtema.findUnique.mockResolvedValue({
      ...valid(),
      estadoContenido: 'BORRADOR',
    });
    await service.crearPregunta('Pregunta', 's1', 'MEDIO', respuestas);
    expect(pregunta.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subtemaId: 's1' }),
      }),
    );
  });

  it('exige subtema en la carga rápida antes de consultar la base', async () => {
    await expect(
      service.crearPreguntaAleatoria('', 'MATEMATICAS', 'Pregunta', respuestas),
    ).rejects.toThrow('subtema específico');
    expect(subtema.findUnique).not.toHaveBeenCalled();
  });

  it('rechaza área incompatible en carga rápida', async () => {
    await expect(
      service.crearPreguntaAleatoria('s1', 'INGLES', 'Pregunta', respuestas),
    ).rejects.toThrow('no pertenece');
    expect(pregunta.create).not.toHaveBeenCalled();
  });

  it('la carga rápida pasa por la misma validación de clasificación y duplicados', async () => {
    pregunta.findFirst.mockResolvedValue({
      id: 'duplicada',
      estadoContenido: 'PUBLICADO',
    });
    await expect(
      service.crearPreguntaAleatoria(
        's1',
        'MATEMATICAS',
        'Pregunta',
        respuestas,
      ),
    ).rejects.toThrow('ya está registrada');
    expect(pregunta.create).not.toHaveBeenCalled();
  });

  it('no edita lecciones en un subtema archivado', async () => {
    subtema.findUnique.mockResolvedValue({
      ...valid(),
      estadoContenido: 'ARCHIVADO',
    });
    await expect(
      service.actualizarContenidoSubtema('s1', 'Lección'),
    ).rejects.toThrow('archivados');
    expect(subtema.update).not.toHaveBeenCalled();
  });

  it('no edita lecciones interactivas genéricas', async () => {
    subtema.findUnique.mockResolvedValue({
      ...valid(),
      nombre: 'Banco General',
    });
    await expect(
      service.actualizarInteractivoSubtema('s1', 'CLOZE', {
        textoConEspacios: 'Texto',
        espacios: [],
      }),
    ).rejects.toThrow('Banco General');
    expect(subtema.update).not.toHaveBeenCalled();
  });

  it('no publica una pregunta genérica heredada', async () => {
    pregunta.findUnique.mockResolvedValue({
      id: 'p1',
      estadoContenido: 'EN_REVISION',
      enunciado: 'Pregunta',
      respuestas,
      subtema: { ...valid(), nombre: 'Banco General' },
      caso: null,
    });
    await expect(
      lifecycle.cambiarEstadoPregunta('p1', 'PUBLICADO'),
    ).rejects.toThrow('Banco General');
    expect(pregunta.update).not.toHaveBeenCalled();
  });

  it('conserva AdminGuard tanto en el catálogo como en las escrituras', () => {
    for (const controller of [AcademicCatalogController, AdminController]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(
        AdminGuard,
      );
    }
  });

  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it.each([
    {},
    { area: 'INVENTADA' },
    { area: 'INGLES', pagina: '0' },
    { area: 'INGLES', limite: '101' },
    { area: 'INGLES', limite: '1.5' },
    { area: 'INGLES', pagina: 'Infinity' },
    { area: 'INGLES', extra: 'campo' },
  ])('valida filtros y límites: %j', async (query) => {
    await expect(
      pipe.transform(query, { type: 'query', metatype: CatalogThemesDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aplica valores por defecto y transforma paginación numérica', async () => {
    await expect(
      pipe.transform(
        { area: 'INGLES', pagina: '2' },
        { type: 'query', metatype: CatalogThemesDto },
      ),
    ).resolves.toMatchObject({ area: 'INGLES', pagina: 2, limite: 50 });
  });
});
