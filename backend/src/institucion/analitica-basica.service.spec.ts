import { PrismaService } from '../prisma/prisma.service';
import { AnaliticaBasicaService } from './analitica-basica.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

describe('AnaliticaBasicaService', () => {
  const subtema = { count: jest.fn() };
  const clase = { findMany: jest.fn() };
  const prisma = { subtema, clase } as unknown as PrismaService;
  const acceso = {
    obtenerMembresiaGestionable: jest.fn(),
    obtenerCapacidadesInstitucion: jest.fn(),
  } as unknown as InstitucionAccesoService;
  const service = new AnaliticaBasicaService(prisma, acceso);

  beforeEach(() => {
    jest.clearAllMocks();
    (acceso.obtenerMembresiaGestionable as jest.Mock).mockResolvedValue({
      id: 'membership-1',
      institucionId: 'institution-1',
      rol: 'PROFESOR',
    });
    (acceso.obtenerCapacidadesInstitucion as jest.Mock).mockResolvedValue({
      plan: 'GRATIS',
      limiteGrupos: 1,
      limiteEstudiantes: 40,
      publicidadHabilitada: true,
    });
    subtema.count.mockResolvedValue(10);
  });

  it('limita al profesor a sus grupos y entrega solo agregados', async () => {
    const reciente = new Date();
    clase.findMany.mockResolvedValue([
      {
        id: 'group-1',
        nombre: 'Once A',
        grado: 'ONCE',
        ClaseEstudiante: [
          {
            Usuario: {
              id: 'student-1',
              resultados: [{ puntaje: 72, fechaRealizado: reciente }],
              progresotemas: [
                { completado: true, fechaVisto: reciente },
                { completado: true, fechaVisto: reciente },
              ],
            },
          },
        ],
      },
    ]);

    const resultado = await service.obtener('teacher-1');

    expect(clase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institucionId: 'institution-1',
          profesores: { some: { miembroId: 'membership-1' } },
        },
      }),
    );
    expect(resultado).toMatchObject({
      nivel: 'BASICA',
      alcance: 'GRUPOS_ASIGNADOS',
      resumen: {
        totalEstudiantes: 1,
        estudiantesActivos: 1,
        totalSimulacros: 1,
        promedioPuntaje: 72,
        progresoPromedio: 20,
      },
      privacidad: { incluyeIdentidades: false },
    });
    expect(JSON.stringify(resultado)).not.toContain('student-1');
    expect(JSON.stringify(resultado)).not.toContain('@');
  });

  it('no duplica un estudiante inscrito en dos grupos del administrador', async () => {
    (acceso.obtenerMembresiaGestionable as jest.Mock).mockResolvedValue({
      id: 'membership-owner',
      institucionId: 'institution-1',
      rol: 'PROPIETARIO',
    });
    const estudiante = {
      id: 'student-1',
      resultados: [],
      progresotemas: [],
    };
    clase.findMany.mockResolvedValue([
      {
        id: 'group-1',
        nombre: 'Once A',
        grado: 'ONCE',
        ClaseEstudiante: [{ Usuario: estudiante }],
      },
      {
        id: 'group-2',
        nombre: 'Refuerzo',
        grado: 'ONCE',
        ClaseEstudiante: [{ Usuario: estudiante }],
      },
    ]);

    const resultado = await service.obtener('owner-1');

    expect(resultado.alcance).toBe('INSTITUCION');
    expect(resultado.resumen.totalEstudiantes).toBe(1);
    expect(resultado.grupos).toHaveLength(2);
  });
});
