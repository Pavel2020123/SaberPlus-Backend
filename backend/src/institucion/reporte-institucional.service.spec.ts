import { ForbiddenException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../prisma/prisma.service';
import { AlertasRiesgoService } from './alertas-riesgo.service';
import { AnaliticaDetalladaService } from './analitica-detallada.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { ReporteInstitucionalService } from './reporte-institucional.service';

describe('ReporteInstitucionalService', () => {
  const auditoriaInstitucion = { create: jest.fn() };
  const prisma = { auditoriaInstitucion } as unknown as PrismaService;
  const obtenerMembresiaGestionable = jest.fn();
  const obtenerCapacidadesInstitucion = jest.fn();
  const acceso = {
    obtenerMembresiaGestionable,
    obtenerCapacidadesInstitucion,
  } as unknown as InstitucionAccesoService;
  const obtenerAnalitica = jest.fn();
  const analitica = {
    obtener: obtenerAnalitica,
  } as unknown as AnaliticaDetalladaService;
  const obtenerAlertas = jest.fn();
  const alertas = {
    obtenerAlertas,
  } as unknown as AlertasRiesgoService;
  const service = new ReporteInstitucionalService(
    prisma,
    acceso,
    analitica,
    alertas,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    obtenerMembresiaGestionable.mockResolvedValue({
      id: 'membership-1',
      institucionId: 'institution-1',
      rol: 'PROFESOR',
    });
    obtenerCapacidadesInstitucion.mockResolvedValue({
      exportacionesHabilitadas: true,
    });
    obtenerAnalitica.mockResolvedValue({
      alcance: 'GRUPOS_ASIGNADOS',
      institucion: {
        totalEstudiantes: 1,
        totalSimulacros: 2,
        promedioGeneral: 55,
      },
      prioridades: [{ area: 'MATEMATICAS', estudiantes: 1, promedio: 40 }],
      estudiantes: [
        {
          id: 'student-1',
          nombre: '=SUM(A1:A2)',
          correo: 'student@example.com',
          grupos: [{ id: 'group-1', nombre: 'Once A' }],
          xpTotal: 100,
          totalSimulacros: 2,
          promedioPuntaje: 55,
          progresoPorcentaje: 20,
          areaPrioritaria: 'MATEMATICAS',
          estadoAcademico: 'ATENCION',
        },
      ],
    });
    obtenerAlertas.mockResolvedValue({
      resumen: { enRiesgo: 1 },
      alertas: [
        {
          estudiante: { id: 'student-1' },
          nivel: 'ALTA',
          actividad: { diasSinActividad: 8 },
        },
      ],
    });
    auditoriaInstitucion.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('genera CSV con BOM y neutraliza fórmulas', async () => {
    const reporte = await service.generarCsv('teacher-1');
    const contenido = reporte.archivo.toString('utf8');

    expect(contenido.startsWith('\uFEFF')).toBe(true);
    expect(contenido).toContain("'=SUM(A1:A2)");
    expect(contenido).toContain('MATEMATICAS');
    expect(reporte.tipoContenido).toContain('text/csv');
    expect(auditoriaInstitucion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accion: 'ANALITICA_EXPORTADA',
        actorId: 'teacher-1',
        detalle: { formato: 'CSV', totalEstudiantes: 1 },
      }),
    });
  });

  it('genera un PDF válido y audita la descarga', async () => {
    const reporte = await service.generarPdf('teacher-1');

    expect(reporte.archivo.subarray(0, 4).toString()).toBe('%PDF');
    expect(reporte.tipoContenido).toBe('application/pdf');
    expect(auditoriaInstitucion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detalle: { formato: 'PDF', totalEstudiantes: 1 },
      }),
    });
  });

  it.each([0, 1])(
    'CSV distingue ausencia de resultados de cero real: %i',
    async (total) => {
      obtenerAnalitica.mockResolvedValue({
        estudiantes: [
          {
            id: 'student-1',
            nombre: 'Ana',
            correo: 'ana@example.com',
            grupos: [],
            xpTotal: 0,
            totalSimulacros: total,
            promedioPuntaje: 0,
            progresoPorcentaje: 0,
            estadoAcademico: 'SIN_DATOS',
          },
        ],
      });
      const reporte = await service.generarCsv('teacher-1');
      const celdas = reporte.archivo
        .toString('utf8')
        .split('\r\n')[1]
        .split(',');
      expect(celdas[5]).toBe(total === 0 ? '"Sin resultados"' : '"0"');
    },
  );

  it('rechaza exportaciones del plan gratuito antes de consultar datos', async () => {
    obtenerCapacidadesInstitucion.mockResolvedValue({
      exportacionesHabilitadas: false,
    });

    await expect(service.generarCsv('teacher-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(obtenerAnalitica).not.toHaveBeenCalled();
  });
});
