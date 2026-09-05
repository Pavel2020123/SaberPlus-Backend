import { BadRequestException } from '@nestjs/common';
import { RolUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AlcanceRanking,
  PeriodoRanking,
  RankingService,
} from './ranking.service';

describe('RankingService', () => {
  const buscarUsuario = jest.fn();
  const listarUsuarios = jest.fn();
  const agruparResultados = jest.fn();
  const agruparBatallas = jest.fn();
  const prisma = {
    usuario: {
      findUnique: buscarUsuario,
      findMany: listarUsuarios,
    },
    resultadoSimulacro: { groupBy: agruparResultados },
    batallaParticipante: { groupBy: agruparBatallas },
  } as unknown as PrismaService;
  const service = new RankingService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    agruparResultados.mockResolvedValue([]);
    agruparBatallas.mockResolvedValue([]);
  });

  it('ordena por XP, comparte empates y no expone identidades ni notas', async () => {
    buscarUsuario.mockResolvedValue({
      id: 'propio',
      rol: RolUsuario.ESTUDIANTE,
      institucionId: null,
    });
    listarUsuarios.mockResolvedValue([
      { id: 'propio', nombre: 'Juan Completo', xpTotal: 100 },
      { id: 'maria', nombre: 'María Gómez', xpTotal: 200 },
      { id: 'pedro', nombre: 'Pedro López', xpTotal: 200 },
      { id: 'sin-actividad', nombre: 'Ana Torres', xpTotal: 0 },
    ]);

    const resultado = await service.obtenerRanking(
      'propio',
      AlcanceRanking.GLOBAL,
      PeriodoRanking.TOTAL,
      10,
    );

    expect(resultado.ranking.map((entrada) => entrada.posicion)).toEqual([
      1, 1, 3,
    ]);
    expect(
      resultado.ranking
        .filter((entrada) => !entrada.esUsuarioActual)
        .every((entrada) => entrada.alias.startsWith('Estudiante ')),
    ).toBe(true);
    expect(resultado.miPosicion).toEqual(
      expect.objectContaining({
        posicion: 3,
        alias: 'Tú',
        esUsuarioActual: true,
      }),
    );
    expect(resultado.totalParticipantes).toBe(3);
    expect(resultado.privacidad).toEqual({
      identidadesProtegidas: true,
      datosPublicados: ['posicion', 'alias', 'xp'],
    });
    expect(JSON.stringify(resultado)).not.toMatch(
      /Juan Completo|María Gómez|Pedro López|propio|maria|pedro|promedio|puntaje/,
    );
    expect(agruparResultados).not.toHaveBeenCalled();
    expect(agruparBatallas).not.toHaveBeenCalled();
  });

  it('usa solo el XP reciente y conserva alias en la institución', async () => {
    buscarUsuario.mockResolvedValue({
      id: 'propio',
      rol: RolUsuario.ESTUDIANTE,
      institucionId: 'institucion-1',
    });
    listarUsuarios.mockResolvedValue([
      { id: 'propio', nombre: 'Juan Completo', xpTotal: 900 },
      { id: 'maria', nombre: 'María Gómez', xpTotal: 100 },
    ]);
    agruparResultados.mockResolvedValue([
      { usuarioId: 'propio', _sum: { xpGanado: 30 } },
      { usuarioId: 'maria', _sum: { xpGanado: 80 } },
    ]);
    agruparBatallas.mockResolvedValue([
      { usuarioId: 'propio', _sum: { xpGanado: 40 } },
    ]);

    const resultado = await service.obtenerRanking(
      'propio',
      AlcanceRanking.INSTITUCION,
      PeriodoRanking.SEMANA,
      10,
    );

    expect(resultado.ranking[0]).toMatchObject({ xp: 80 });
    expect(resultado.ranking[0].alias).toMatch(/^Estudiante /);
    expect(resultado.miPosicion).toMatchObject({ alias: 'Tú', xp: 70 });
    expect(resultado.nombreAlcance).toBe('Mi institución');
    expect(JSON.stringify(resultado)).not.toMatch(
      /Colegio Central|Juan Completo|María Gómez|institucion-1|propio|maria/,
    );
    expect(agruparResultados).toHaveBeenCalledTimes(1);
    expect(agruparBatallas).toHaveBeenCalledTimes(1);
  });

  it('rechaza el alcance institucional sin pertenencia', async () => {
    buscarUsuario.mockResolvedValue({
      id: 'propio',
      rol: RolUsuario.ESTUDIANTE,
      institucionId: null,
    });

    await expect(
      service.obtenerRanking(
        'propio',
        AlcanceRanking.INSTITUCION,
        PeriodoRanking.TOTAL,
        10,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(listarUsuarios).not.toHaveBeenCalled();
  });
});
