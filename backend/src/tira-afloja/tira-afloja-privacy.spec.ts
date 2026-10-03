import { ForbiddenException } from '@nestjs/common';
import { EstadoPartidaTiraAfloja, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TiraAflojaRealtimePublisher } from './tira-afloja-realtime.publisher';
import { TiraAflojaService } from './tira-afloja.service';

function escenario() {
  const partida = {
    id: 'partida-publica',
    jugadorAId: 'cuenta-privada-a',
    jugadorBId: 'cuenta-privada-b' as string | null,
    jugadorA: {
      id: 'cuenta-privada-a',
      nombre: 'Nombre académico A',
      fotoPerfil: 'foto-privada-a',
    },
    jugadorB: {
      id: 'cuenta-privada-b',
      nombre: 'Nombre académico B',
      fotoPerfil: 'foto-privada-b',
    },
    estado: EstadoPartidaTiraAfloja.PREPARANDO as EstadoPartidaTiraAfloja,
    expiraEn: new Date(Date.now() + 60_000),
    ganadorId: null as string | null,
    version: 1,
    versionReglas: 1,
    posicionCuerda: 0,
    rondaActual: 0,
    preguntaActualId: null as string | null,
    preguntaActual: null,
    preguntas: [
      {
        orden: 1,
        preguntaId: 'pregunta-publica',
        opcionesOrden: ['opcion-publica'],
      },
    ],
    rondaIniciaEn: null as Date | null,
    rondaVenceEn: null as Date | null,
    listoA: true,
    listoB: false,
  };
  const eventos: Array<{
    version: number;
    tipo: string;
    datos: Prisma.JsonValue;
    fecha: Date;
  }> = [];
  const respuestas: Array<{
    usuarioId: string;
    esCorrecta: boolean;
    recibidaEn: Date;
  }> = [];
  const modelo = {
    findUnique: jest.fn(() => Promise.resolve(partida)),
    findFirst: jest.fn(),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      Object.assign(partida, data);
      return Promise.resolve(partida);
    }),
    updateMany: jest.fn(
      ({
        data,
      }: {
        data: { jugadorBId: string; estado: EstadoPartidaTiraAfloja };
      }) => {
        partida.jugadorBId = data.jugadorBId;
        partida.estado = data.estado;
        return Promise.resolve({ count: 1 });
      },
    ),
  };
  const db = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    partidaTiraAfloja: modelo,
    usuario: { findUnique: jest.fn().mockResolvedValue({ rol: 'ESTUDIANTE' }) },
    pregunta: {
      findMany: jest.fn().mockResolvedValue(
        Array.from({ length: 4 }, (_, i) => ({
          id: `p${i}`,
          respuestas: [{ id: 'x' }, { id: 'y' }],
        })),
      ),
    },
    respuesta: { findFirst: jest.fn().mockResolvedValue({ esCorrecta: true }) },
    tiraAflojaPregunta: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ preguntaId: 'pregunta-publica' }),
    },
    tiraAflojaRespuesta: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(() => Promise.resolve(respuestas)),
      create: jest.fn(({ data }: { data: (typeof respuestas)[number] }) => {
        respuestas.push(data);
        return Promise.resolve(data);
      }),
    },
    tiraAflojaEvento: {
      findMany: jest.fn(() => Promise.resolve(eventos)),
      create: jest.fn(
        ({ data }: { data: Omit<(typeof eventos)[number], 'fecha'> }) => {
          eventos.push({ ...data, fecha: new Date() });
          return Promise.resolve(data);
        },
      ),
    },
  };
  const prisma = {
    ...db,
    $transaction: <T>(run: (tx: typeof db) => Promise<T>) => run(db),
  } as unknown as PrismaService;
  return {
    partida,
    eventos,
    db,
    service: new TiraAflojaService(prisma, new TiraAflojaRealtimePublisher()),
  };
}

describe('Tira: privacidad sin cambiar reglas ni identificadores internos de persistencia', () => {
  it.each([
    { ronda: 2 },
    { preguntaId: 'otra-pregunta' },
    { respuestaId: 'otra-opcion' },
  ])('rechaza payload distinto para una clave aceptada: %j', async (cambio) => {
    const { service, partida, db } = escenario();
    const entrada = {
      ronda: 1,
      preguntaId: 'pregunta-publica',
      respuestaId: 'opcion-publica',
      idempotencyKey: 'operacion-publica',
    };
    db.tiraAflojaRespuesta.findUnique.mockResolvedValue({
      partidaId: partida.id,
      usuarioId: partida.jugadorAId,
      ronda: entrada.ronda,
      preguntaId: entrada.preguntaId,
      respuestaSeleccionadaId: entrada.respuestaId,
    } as never);
    await expect(
      service.responder(partida.jugadorAId, partida.id, {
        ...entrada,
        ...cambio,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.tiraAflojaRespuesta.create).not.toHaveBeenCalled();
    expect(db.respuesta.findFirst).not.toHaveBeenCalled();
  });

  it.each(['A', 'B'] as const)(
    'presenta asientos al lado %s sin identidad privada ni datos extra históricos',
    async (lado) => {
      const { service, partida, eventos, db } = escenario();
      partida.estado = EstadoPartidaTiraAfloja.FINALIZADA;
      partida.ganadorId = partida.jugadorBId;
      eventos.push({
        version: 3,
        tipo: 'FINALIZADA',
        fecha: new Date(),
        datos: {
          ganadorId: partida.jugadorBId,
          jugadorBId: partida.jugadorBId,
          abandonoUsuarioId: partida.jugadorAId,
          nombre: 'Nombre académico A',
          fotoPerfil: 'foto-privada-a',
          extra: { usuarioId: partida.jugadorAId },
          resultado: 'JUGADOR_B',
          posicionCuerda: -5,
        },
      });
      const state = await service.obtener(
        lado === 'A' ? partida.jugadorAId : (partida.jugadorBId ?? ''),
        partida.id,
      );
      expect(state.partida.yo).toEqual({
        id: lado,
        nombre: `Jugador ${lado}`,
        fotoPerfil: null,
      });
      expect(state.partida.rival).toEqual({
        id: lado === 'A' ? 'B' : 'A',
        nombre: lado === 'A' ? 'Jugador B' : 'Jugador A',
        fotoPerfil: null,
      });
      expect(state.partida.ganadorId).toBe('B');
      expect(state.eventos[0].datos).toEqual({
        ganadorId: 'B',
        jugadorBId: 'B',
        abandonoUsuarioId: 'A',
        resultado: 'JUGADOR_B',
        posicionCuerda: -5,
      });
      expect(JSON.stringify(state)).not.toMatch(
        /cuenta-privada|Nombre académico|foto-privada/,
      );
      expect(
        JSON.stringify(db.partidaTiraAfloja.findUnique.mock.calls),
      ).not.toMatch(/jugadorA|jugadorB|nombre|fotoPerfil/);
    },
  );

  it('rechaza al tercero ajeno a la partida', async () => {
    const { service, partida } = escenario();
    await expect(service.obtener('ajeno', partida.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('empareja con UUID internos pero solo devuelve la referencia de asiento', async () => {
    const { service, partida, db } = escenario();
    partida.estado = EstadoPartidaTiraAfloja.BUSCANDO;
    partida.jugadorBId = null;
    db.partidaTiraAfloja.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...partida });
    const state = await service.emparejar('cuenta-privada-b');
    expect(db.partidaTiraAfloja.updateMany).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          jugadorBId: 'cuenta-privada-b',
        }),
      }),
    );
    expect(state.partida.yo.id).toBe('B');
    expect(state.partida.rival?.id).toBe('A');
    expect(state.eventos[0].datos).toEqual({ jugadorBId: 'B' });
    expect(JSON.stringify(state)).not.toContain('cuenta-privada');
  });

  it('permite preparar y responder manteniendo pregunta, operación y usuario internos', async () => {
    const { service, partida, db } = escenario();
    const ready = await service.marcarListo('cuenta-privada-b', partida.id);
    expect(ready.partida.estado).toBe('ACTIVA');
    partida.rondaIniciaEn = new Date(Date.now() - 1000);
    const state = await service.responder('cuenta-privada-b', partida.id, {
      ronda: 1,
      preguntaId: 'pregunta-publica',
      respuestaId: 'opcion-publica',
      idempotencyKey: 'operacion-publica',
    });
    expect(db.tiraAflojaRespuesta.create).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        data: expect.objectContaining<Record<string, unknown>>({
          usuarioId: 'cuenta-privada-b',
          respuestaSeleccionadaId: 'opcion-publica',
        }),
      }),
    );
    expect(state.partida.yaRespondi).toBe(true);
    expect(JSON.stringify(state)).not.toContain('cuenta-privada');
  });

  it('conserva ganador por abandono y oculta IDs también en el evento de cierre', async () => {
    const { service, partida } = escenario();
    const state = await service.abandonar('cuenta-privada-a', partida.id);
    expect(partida.ganadorId).toBe('cuenta-privada-b');
    expect(state.partida.ganadorId).toBe('B');
    expect(state.eventos[state.eventos.length - 1]?.datos).toEqual({
      abandonoUsuarioId: 'A',
      ganadorId: 'B',
    });
    expect(JSON.stringify(state)).not.toContain('cuenta-privada');
  });
});
