import { ForbiddenException } from '@nestjs/common';
import { AreaIcfes, TipoActividadPlan } from '@prisma/client';
import { CalendarioIcfesService } from '../calendario-icfes/calendario-icfes.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanEstudioService } from './plan-estudio.service';

describe('PlanEstudioService', () => {
  const usuario = { findUnique: jest.fn() };
  const diagnosticoInicial = { findFirst: jest.fn() };
  const planEstudioSemanal = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const planEstudioActividad = { deleteMany: jest.fn() };
  const tema = { findMany: jest.fn() };
  const progresoTema = { findMany: jest.fn() };
  const resultadoSimulacro = { findFirst: jest.fn() };
  const tx = { planEstudioSemanal, planEstudioActividad };
  const prisma = {
    usuario,
    diagnosticoInicial,
    planEstudioSemanal,
    planEstudioActividad,
    tema,
    progresoTema,
    resultadoSimulacro,
    $transaction: jest.fn((callback: (cliente: typeof tx) => unknown) =>
      callback(tx),
    ),
  } as unknown as PrismaService;
  const calendarioService = {
    obtenerCalendarioActivo: jest.fn(),
  } as unknown as CalendarioIcfesService;
  const service = new PlanEstudioService(prisma, calendarioService);

  const resultados = [
    { area: AreaIcfes.MATEMATICAS, porcentaje: 20 },
    { area: AreaIcfes.LECTURA_CRITICA, porcentaje: 55 },
    { area: AreaIcfes.CIENCIAS_NATURALES, porcentaje: 65 },
    { area: AreaIcfes.SOCIALES_CIUDADANAS, porcentaje: 70 },
    { area: AreaIcfes.INGLES, porcentaje: 80 },
  ];

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-21T15:00:00Z'));
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue({ rol: 'ESTUDIANTE' });
    diagnosticoInicial.findFirst.mockResolvedValue({
      id: 'diagnostico-1',
      porcentaje: 58,
      completadoEn: new Date('2026-08-20T12:00:00Z'),
      resultadosPorArea: resultados,
    });
    calendarioService.obtenerCalendarioActivo = jest.fn().mockResolvedValue({
      calendario: 'A',
      fechaExamen: new Date('2026-12-06T00:00:00Z'),
    });
    planEstudioSemanal.findUnique.mockResolvedValue(null);
    progresoTema.findMany.mockResolvedValue([]);
    resultadoSimulacro.findFirst.mockResolvedValue(null);
  });

  it('solicita primero el diagnóstico cuando el estudiante no lo ha terminado', async () => {
    diagnosticoInicial.findFirst.mockResolvedValue(null);

    await expect(service.obtenerPlanSemanal('usuario-1')).resolves.toEqual({
      estado: 'DIAGNOSTICO_PENDIENTE',
    });
    expect(planEstudioSemanal.findUnique).not.toHaveBeenCalled();
  });

  it('prioriza el área más débil y persiste una agenda estable', async () => {
    type DatosCreacion = {
      inicioSemana: Date;
      actividades: {
        create: Array<{
          tipo: TipoActividadPlan;
          area?: AreaIcfes;
          subtemaId?: string;
          [clave: string]: unknown;
        }>;
      };
      [clave: string]: unknown;
    };
    let creacionCapturada: DatosCreacion | null = null;
    tema.findMany.mockResolvedValue([
      {
        id: 'tema-math',
        nombre: 'Álgebra',
        area: AreaIcfes.MATEMATICAS,
        subtemas: [{ id: 'sub-math', nombre: 'Ecuaciones' }],
      },
      {
        id: 'tema-lectura',
        nombre: 'Comprensión',
        area: AreaIcfes.LECTURA_CRITICA,
        subtemas: [{ id: 'sub-lectura', nombre: 'Inferencias' }],
      },
    ]);
    planEstudioSemanal.create.mockImplementation(
      ({ data }: { data: DatosCreacion }) => {
        creacionCapturada = data;
        return Promise.resolve({
          id: 'plan-1',
          ...data,
          fechaCreacion: new Date('2026-08-21T15:00:00Z'),
          actividades: data.actividades.create.map((actividad, indice) => ({
            id: `actividad-${indice}`,
            ...actividad,
            area: actividad.area ?? null,
            subtemaId: actividad.subtemaId ?? null,
          })),
        });
      },
    );

    const respuesta = await service.obtenerPlanSemanal('usuario-1');

    expect(planEstudioSemanal.create).toHaveBeenCalledTimes(1);
    expect(creacionCapturada?.inicioSemana).toEqual(
      new Date('2026-08-17T00:00:00Z'),
    );
    expect(creacionCapturada?.actividades.create[0]).toEqual(
      expect.objectContaining({
        tipo: TipoActividadPlan.ESTUDIO,
        area: AreaIcfes.MATEMATICAS,
        subtemaId: 'sub-math',
      }),
    );
    expect(respuesta.estado).toBe('LISTO');
    if (respuesta.estado !== 'LISTO') throw new Error('Estado inesperado');
    expect(respuesta.diagnostico.areaPrioritaria).toBe(AreaIcfes.MATEMATICAS);
  });

  it('reutiliza el plan existente durante la misma semana', async () => {
    planEstudioSemanal.findUnique.mockResolvedValue({
      id: 'plan-1',
      diagnosticoId: 'diagnostico-1',
      calendarioIcfes: 'A',
      fechaExamen: new Date('2026-12-06T00:00:00Z'),
      inicioSemana: new Date('2026-08-17T00:00:00Z'),
      finSemana: new Date('2026-08-23T00:00:00Z'),
      fechaCreacion: new Date('2026-08-18T12:00:00Z'),
      sesionesObjetivo: 1,
      minutosObjetivoSemanal: 40,
      actividades: [
        {
          id: 'actividad-1',
          fecha: new Date('2026-08-21T00:00:00Z'),
          tipo: TipoActividadPlan.ESTUDIO,
          area: AreaIcfes.MATEMATICAS,
          titulo: 'Álgebra: Ecuaciones',
          detalle: 'Estudia el contenido.',
          minutos: 40,
          subtemaId: 'sub-math',
        },
      ],
    });

    const respuesta = await service.obtenerPlanSemanal('usuario-1');

    expect(respuesta.estado).toBe('LISTO');
    expect(tema.findMany).not.toHaveBeenCalled();
    expect(planEstudioSemanal.create).not.toHaveBeenCalled();
  });

  it('rechaza usuarios que no sean estudiantes', async () => {
    usuario.findUnique.mockResolvedValue({ rol: 'PROFESOR' });

    await expect(
      service.obtenerPlanSemanal('profesor-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
