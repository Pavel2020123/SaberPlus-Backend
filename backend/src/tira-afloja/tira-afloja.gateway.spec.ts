import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { TiraAflojaRealtimePublisher } from './tira-afloja-realtime.publisher';
import { TiraAflojaWsAuthService } from './tira-afloja-ws-auth.service';
import { TiraAflojaWsExceptionFilter } from './tira-afloja-ws-exception.filter';
import { TiraAflojaGateway } from './tira-afloja.gateway';
import { TiraAflojaService } from './tira-afloja.service';
import { TiraAflojaPresenceService } from './tira-afloja-presence.service';

describe('TiraAflojaGateway', () => {
  let app: INestApplication;
  let cliente: ClientSocket;

  const juego = {
    obtenerActiva: jest.fn().mockResolvedValue(null),
  };
  const autenticacion = {
    autenticar: jest.fn().mockResolvedValue({ id: 'usuario-1', nombre: 'Ana' }),
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      providers: [
        TiraAflojaGateway,
        TiraAflojaRealtimePublisher,
        TiraAflojaWsExceptionFilter,
        {
          provide: TiraAflojaPresenceService,
          useValue: {
            enrolled: jest.fn().mockResolvedValue(false),
            connect: jest.fn().mockResolvedValue('LEGACY'),
          },
        },
        { provide: TiraAflojaService, useValue: juego },
        { provide: TiraAflojaWsAuthService, useValue: autenticacion },
      ],
    }).compile();
    app = modulo.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterEach(() => {
    cliente?.disconnect();
  });

  afterAll(async () => {
    await app.close();
  });

  it('autentica, confirma la conexion y responde con reloj del servidor', async () => {
    const url = await app.getUrl();
    cliente = io(`${url}/tira-afloja`, {
      transports: ['websocket'],
      auth: { token: 'token-prueba' },
      forceNew: true,
      reconnection: false,
    });

    const conectado = await esperarEvento<{
      servidorAhora: string;
      partidaId: string | null;
      recuperada: boolean;
    }>(cliente, 'tira:conectado');
    expect(conectado.partidaId).toBeNull();
    expect(conectado.recuperada).toBe(false);
    expect(Number.isNaN(Date.parse(conectado.servidorAhora))).toBe(false);

    const latido = await emitirConRespuesta<{ servidorAhora: string }>(
      cliente,
      'tira:latido',
    );
    expect(Number.isNaN(Date.parse(latido.servidorAhora))).toBe(false);
    expect(autenticacion.autenticar).toHaveBeenCalled();
    expect(juego.obtenerActiva).toHaveBeenCalledWith('usuario-1');
  });

  it('emite presencia de entrada y salida sin UUID de cuenta', async () => {
    autenticacion.autenticar
      .mockResolvedValueOnce({ id: 'privado-a', nombre: 'Nombre privado A' })
      .mockResolvedValueOnce({ id: 'privado-b', nombre: 'Nombre privado B' });
    juego.obtenerActiva
      .mockResolvedValueOnce({
        partida: { id: 'partida', lado: 'A', version: 1 },
      })
      .mockResolvedValueOnce({
        partida: { id: 'partida', lado: 'B', version: 1 },
      });
    const url = await app.getUrl();
    cliente = io(`${url}/tira-afloja`, {
      transports: ['websocket'],
      auth: { token: 'a' },
      forceNew: true,
      reconnection: false,
    });
    await esperarEvento(cliente, 'tira:conectado');
    const entrada = esperarEvento<{ usuarioId: string; conectado: boolean }>(
      cliente,
      'tira:presencia',
    );
    const rival = io(`${url}/tira-afloja`, {
      transports: ['websocket'],
      auth: { token: 'b' },
      forceNew: true,
      reconnection: false,
    });
    try {
      expect(await entrada).toMatchObject({ usuarioId: 'B', conectado: true });
      const salida = esperarEvento<{ usuarioId: string; conectado: boolean }>(
        cliente,
        'tira:presencia',
      );
      rival.disconnect();
      const mensaje = await salida;
      expect(mensaje).toMatchObject({ usuarioId: 'B', conectado: false });
      expect(JSON.stringify(mensaje)).not.toMatch(/privado|Nombre/);
    } finally {
      rival.disconnect();
    }
  });
});

function esperarEvento<T>(cliente: ClientSocket, evento: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(
      () => reject(new Error(`No se recibio ${evento}.`)),
      5000,
    );
    cliente.once(evento, (datos: T) => {
      clearTimeout(temporizador);
      resolve(datos);
    });
  });
}

function emitirConRespuesta<T>(
  cliente: ClientSocket,
  evento: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const temporizador = setTimeout(
      () => reject(new Error(`No hubo respuesta para ${evento}.`)),
      5000,
    );
    cliente.emit(evento, (respuesta: T) => {
      clearTimeout(temporizador);
      resolve(respuesta);
    });
  });
}
