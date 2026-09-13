import { PrismaService } from '../prisma/prisma.service';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { InstitucionAccesoService } from './institucion-acceso.service';
import { AnaliticaBasicaService } from './analitica-basica.service';
import { AnaliticaDetalladaService } from './analitica-detallada.service';
import { AlertasRiesgoService } from './alertas-riesgo.service';

const publicado = {
  AND: [
    { estadoContenido: 'PUBLICADO' },
    { tema: { estadoContenido: 'PUBLICADO' } },
    {},
  ],
};
const countPublicado = {
  select: {
    progresotemas: { where: { completado: true, subtema: publicado } },
  },
};

describe('avance docente sobre el catálogo publicado', () => {
  const fecha = new Date('2026-09-12T12:00:00Z');
  const acceso = {
    obtenerMembresiaGestionable: jest.fn().mockResolvedValue({
      id: 'membership',
      institucionId: 'institution',
      rol: 'PROFESOR',
    }),
    obtenerCapacidadesInstitucion: jest.fn().mockResolvedValue({
      nivelAnalitica: 'DETALLADA',
      alertasHabilitadas: true,
    }),
  } as unknown as InstitucionAccesoService;

  afterEach(() => jest.useRealTimers());

  it.each(['basica', 'detallada', 'alertas'] as const)(
    '%s excluye borradores del avance sin perder actividad histórica',
    async (tipo) => {
      jest.useFakeTimers().setSystemTime(fecha);
      const estudiante = {
        id: 'student',
        nombre: 'Ana',
        correo: 'ana@example.com',
        xpTotal: 0,
        fechaCreacion: new Date('2026-08-01T12:00:00Z'),
        ClaseEstudiante: [],
        diagnosticoInicial: null,
        resultados: [],
        historialRespuestas: [],
        // Tres lecciones históricas, pero solo una completada sigue publicada.
        _count: { progresotemas: 1 },
        progresotemas: Array.from({ length: 3 }, () => ({
          completado: true,
          fechaVisto: fecha,
        })),
      };
      const subtema = { count: jest.fn().mockResolvedValue(4) };
      const usuario = { findMany: jest.fn().mockResolvedValue([estudiante]) };
      const clase = {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'group',
            nombre: 'Once',
            grado: 'ONCE',
            ClaseEstudiante: [{ Usuario: estudiante }],
          },
        ]),
      };
      const prisma = {
        subtema,
        usuario,
        clase,
        historialRespuesta: { groupBy: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;

      if (tipo === 'basica') {
        const resultado = await new AnaliticaBasicaService(
          prisma,
          acceso,
        ).obtener('teacher');
        expect(resultado.resumen.progresoPromedio).toBe(25);
        expect(resultado.resumen.ultimaActividad).toEqual(fecha);
        expect(clase.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            select: expect.objectContaining({
              ClaseEstudiante: {
                select: {
                  Usuario: {
                    select: expect.objectContaining({
                      _count: countPublicado,
                      progresotemas: {
                        select: { completado: true, fechaVisto: true },
                      },
                    }),
                  },
                },
              },
            }),
          }),
        );
      } else if (tipo === 'detallada') {
        const resultado = await new AnaliticaDetalladaService(
          prisma,
          acceso,
        ).obtener('teacher');
        expect(resultado.estudiantes[0].progresoPorcentaje).toBe(25);
        expect(resultado.estudiantes[0].ultimaActividad).toEqual(fecha);
      } else {
        const resultado = await new AlertasRiesgoService(
          prisma,
          acceso,
        ).obtenerAlertas('teacher');
        expect(resultado.alertas[0].progreso).toMatchObject({
          temasCompletados: 1,
          totalSubtemas: 4,
        });
        expect(resultado.alertas[0].actividad.ultimaActividad).toEqual(fecha);
        expect(
          resultado.alertas[0].razones.map((razon) => razon.codigo),
        ).not.toContain('INACTIVIDAD');
      }
      expect(subtema.count).toHaveBeenCalledWith({ where: publicado });
      if (tipo !== 'basica') {
        expect(usuario.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            select: expect.objectContaining({
              _count: countPublicado,
              progresotemas: { select: { completado: true, fechaVisto: true } },
            }),
          }),
        );
      }
    },
  );

  it('un catálogo vacío no produce NaN ni borra el historial', async () => {
    const prisma = {
      subtema: { count: jest.fn().mockResolvedValue(0) },
      usuario: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'student',
            nombre: 'Ana',
            correo: 'ana@example.com',
            ClaseEstudiante: [],
            resultados: [],
            diagnosticoInicial: null,
            _count: { progresotemas: 0 },
            progresotemas: [{ completado: true, fechaVisto: fecha }],
          },
        ]),
      },
    } as unknown as PrismaService;
    const resultado = await new AnaliticaDetalladaService(
      prisma,
      acceso,
    ).obtener('teacher');
    expect(resultado.estudiantes[0]).toMatchObject({
      totalSubtemas: 0,
      temasCompletados: 0,
      progresoPorcentaje: 0,
      ultimaActividad: fecha,
      estadoAcademico: 'SIN_DATOS',
    });
  });
});
