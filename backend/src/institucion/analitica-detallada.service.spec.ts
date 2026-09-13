import { ForbiddenException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../prisma/prisma.service';
import { AnaliticaDetalladaService } from './analitica-detallada.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

describe('AnaliticaDetalladaService', () => {
  const subtema = { count: jest.fn() };
  const usuario = { findMany: jest.fn() };
  const prisma = { subtema, usuario } as unknown as PrismaService;
  const obtenerMembresiaGestionable = jest.fn();
  const obtenerCapacidadesInstitucion = jest.fn();
  const acceso = {
    obtenerMembresiaGestionable,
    obtenerCapacidadesInstitucion,
  } as unknown as InstitucionAccesoService;
  const service = new AnaliticaDetalladaService(prisma, acceso);

  beforeEach(() => {
    jest.clearAllMocks();
    obtenerMembresiaGestionable.mockResolvedValue({
      id: 'membership-1',
      institucionId: 'institution-1',
      rol: 'PROFESOR',
    });
    obtenerCapacidadesInstitucion.mockResolvedValue({
      plan: 'SIN_ANUNCIOS',
      esGratuito: false,
      publicidadHabilitada: false,
      nivelAnalitica: 'DETALLADA',
      alertasHabilitadas: true,
      prioridadesHabilitadas: true,
      exportacionesHabilitadas: true,
      planVencido: false,
      venceEn: new Date('2027-01-01T00:00:00Z'),
      limiteGrupos: 5,
      limiteEstudiantes: 200,
    });
    subtema.count.mockResolvedValue(20);
  });

  it('limita al profesor a sus grupos y calcula prioridades', async () => {
    usuario.findMany.mockResolvedValue([
      {
        id: 'student-1',
        _count: { progresotemas: 1 },
        nombre: 'Ana',
        correo: 'ana@example.com',
        xpTotal: 500,
        ClaseEstudiante: [{ Clase: { id: 'group-1', nombre: 'Once A' } }],
        resultados: [
          {
            area: 'MATEMATICAS',
            puntaje: 40,
            fechaRealizado: new Date('2026-08-20T00:00:00Z'),
          },
          {
            area: 'LECTURA_CRITICA',
            puntaje: 70,
            fechaRealizado: new Date('2026-08-25T00:00:00Z'),
          },
        ],
        progresotemas: [
          { completado: true, fechaVisto: new Date('2026-08-26T00:00:00Z') },
        ],
        diagnosticoInicial: { resultadosPorArea: [] },
      },
    ]);

    const result = await service.obtener('teacher-1');

    expect(usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ClaseEstudiante: {
            some: {
              Clase: {
                profesores: { some: { miembroId: 'membership-1' } },
              },
            },
          },
        }),
      }),
    );
    expect(result).toMatchObject({
      nivel: 'DETALLADA',
      alcance: 'GRUPOS_ASIGNADOS',
      institucion: {
        totalEstudiantes: 1,
        promedioGeneral: 55,
        totalSimulacros: 2,
      },
      prioridades: [{ area: 'MATEMATICAS', estudiantes: 1, promedio: 40 }],
    });
    expect(result.estudiantes[0]).toMatchObject({
      areaPrioritaria: 'MATEMATICAS',
      estadoAcademico: 'ATENCION',
      progresoPorcentaje: 5,
    });
  });

  it('rechaza la analítica detallada del plan gratuito', async () => {
    obtenerCapacidadesInstitucion.mockResolvedValue({
      nivelAnalitica: 'BASICA',
    });

    await expect(service.obtener('teacher-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(usuario.findMany).not.toHaveBeenCalled();
  });
});
