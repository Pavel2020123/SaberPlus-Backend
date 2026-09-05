import { PrismaService } from '../prisma/prisma.service';
import { calcularRacha, GamificacionService } from './gamificacion.service';

describe('GamificacionService', () => {
  const historialRespuesta = { findMany: jest.fn() };
  const resultadoSimulacro = { findMany: jest.fn() };
  const progresoTema = { findMany: jest.fn() };
  const batallaEstadistica = { findUnique: jest.fn() };
  const prisma = {
    historialRespuesta,
    resultadoSimulacro,
    progresoTema,
    batallaEstadistica,
  } as unknown as PrismaService;
  const service = new GamificacionService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    historialRespuesta.findMany.mockResolvedValue([]);
    resultadoSimulacro.findMany.mockResolvedValue([]);
    progresoTema.findMany.mockResolvedValue([]);
    batallaEstadistica.findUnique.mockResolvedValue(null);
  });

  it('calcula una racha vigente usando dias de Colombia y elimina duplicados', () => {
    const racha = calcularRacha(
      [
        new Date('2026-08-19T13:00:00Z'),
        new Date('2026-08-20T01:00:00Z'),
        new Date('2026-08-20T18:00:00Z'),
        new Date('2026-08-21T15:00:00Z'),
      ],
      new Date('2026-08-22T02:00:00Z'),
    );

    expect(racha).toEqual({
      actual: 3,
      mejor: 3,
      activoHoy: true,
      ultimaActividad: '2026-08-21',
    });
  });

  it('conserva la mejor racha aunque la actual se haya interrumpido', () => {
    const racha = calcularRacha(
      [
        new Date('2026-08-10T15:00:00Z'),
        new Date('2026-08-11T15:00:00Z'),
        new Date('2026-08-12T15:00:00Z'),
      ],
      new Date('2026-08-20T15:00:00Z'),
    );

    expect(racha.actual).toBe(0);
    expect(racha.mejor).toBe(3);
    expect(racha.activoHoy).toBe(false);
  });

  it('desbloquea logros a partir de la actividad real', async () => {
    historialRespuesta.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, indice) => ({
        fechaRespuesta: new Date('2026-08-21T15:00:00Z'),
        esCorrecta: indice < 20,
        area: ['MATEMATICAS', 'INGLES'][indice % 2],
      })),
    );
    resultadoSimulacro.findMany.mockResolvedValue([
      { fechaRealizado: new Date('2026-08-21T15:00:00Z'), puntaje: 100 },
    ]);
    progresoTema.findMany.mockResolvedValue([
      { fechaVisto: new Date('2026-08-21T15:00:00Z'), completado: true },
    ]);

    const resultado = await service.obtenerResumen('usuario-1');
    const porId = new Map(resultado.logros.map((logro) => [logro.id, logro]));

    expect(porId.get('PRIMER_PASO')?.desbloqueado).toBe(true);
    expect(porId.get('MENTE_ACTIVA')?.desbloqueado).toBe(true);
    expect(porId.get('PRIMER_SIMULACRO')?.desbloqueado).toBe(true);
    expect(porId.get('IMPECABLE')?.desbloqueado).toBe(true);
    expect(porId.get('EXPLORADOR')).toMatchObject({ progreso: 2, meta: 5 });
    expect(resultado.resumen.total).toBe(16);
    expect(resultado.actividad).toEqual([
      { fecha: '2026-08-21', cantidad: 27 },
    ]);
  });

  it('desbloquea insignias con victorias y rachas de batalla reales', async () => {
    batallaEstadistica.findUnique.mockResolvedValue({
      batallasJugadas: 5,
      victorias: 4,
      mejorRachaVictorias: 3,
      victoriasPerfectas: 1,
    });

    const resultado = await service.obtenerResumen('usuario-1');
    const porId = new Map(resultado.logros.map((logro) => [logro.id, logro]));

    expect(porId.get('PRIMERA_VICTORIA')?.desbloqueado).toBe(true);
    expect(porId.get('RACHA_BATALLA_3')?.desbloqueado).toBe(true);
    expect(porId.get('VICTORIA_PERFECTA')?.desbloqueado).toBe(true);
    expect(porId.get('VETERANO_BATALLA')).toMatchObject({
      progreso: 4,
      meta: 10,
    });
  });

  it('rechaza el certificado de un logro que aun no se completo', async () => {
    await expect(
      service.obtenerLogroDesbloqueado('usuario-1', 'RACHA_7'),
    ).rejects.toThrow('Completa este logro');
  });
});
