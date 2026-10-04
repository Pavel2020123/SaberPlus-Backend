import {
  HttpException,
  Logger,
  OnModuleDestroy,
  UseFilters,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AreaIcfes } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Server, Socket } from 'socket.io';
import { Subscription } from 'rxjs';
import { randomUUID } from 'crypto';
import { TiraAflojaPresenceService } from './tira-afloja-presence.service';
import { TiraAflojaRealtimePublisher } from './tira-afloja-realtime.publisher';
import { TiraAflojaService } from './tira-afloja.service';
import { TiraAflojaWsAuthService } from './tira-afloja-ws-auth.service';
import { TiraAflojaWsExceptionFilter } from './tira-afloja-ws-exception.filter';
import { parseAllowedOrigins } from '../config/runtime-environment';

const VENTANA_LIMITE_MS = 10_000;
const MAX_ACCIONES_POR_VENTANA = 30;
const ORIGENES_PERMITIDOS = parseAllowedOrigins(
  process.env.ALLOWED_ORIGINS?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    'http://localhost:3001',
);

interface DatosSocketTiraAfloja {
  usuarioId?: string;
  nombre?: string;
  partidaId?: string;
  lado?: 'A' | 'B';
  acciones?: number[];
  presenceId?: string;
  disconnectReason?: string;
  renewing?: Promise<void>;
}

interface EventosServidorACliente {
  'tira:actualizada': (datos: unknown) => void;
  'tira:conectado': (datos: unknown) => void;
  'tira:error': (datos: unknown) => void;
  'tira:estado': (datos: unknown) => void;
  'tira:presencia': (datos: unknown) => void;
}

type SocketTiraAfloja = Socket<
  Record<string, never>,
  EventosServidorACliente,
  Record<string, never>,
  DatosSocketTiraAfloja
>;

class EmparejarWsDto {
  @IsOptional()
  @IsEnum(AreaIcfes)
  area?: AreaIcfes;
}

class PartidaWsDto {
  @IsUUID()
  partidaId!: string;
}

class SincronizarWsDto extends PartidaWsDto {
  @IsOptional()
  @IsInt()
  @Min(-1)
  desdeVersion?: number;
}

class ResponderWsDto extends PartidaWsDto {
  @IsInt()
  @Min(1)
  ronda!: number;

  @IsUUID()
  preguntaId!: string;

  @IsUUID()
  respuestaId!: string;

  @IsUUID()
  idempotencyKey!: string;
}

function salaPartida(partidaId: string): string {
  return `partida:${partidaId}`;
}

function salaUsuario(usuarioId: string): string {
  return `usuario:${usuarioId}`;
}

@WebSocketGateway({
  namespace: '/tira-afloja',
  transports: ['websocket'],
  maxHttpBufferSize: 100_000,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
  cors: {
    origin: ORIGENES_PERMITIDOS,
    methods: ['GET', 'POST'],
  },
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
@UseFilters(TiraAflojaWsExceptionFilter)
export class TiraAflojaGateway
  implements
    OnGatewayInit,
    OnGatewayConnection<SocketTiraAfloja>,
    OnGatewayDisconnect<SocketTiraAfloja>,
    OnModuleDestroy
{
  @WebSocketServer()
  private servidor!: Server;

  private suscripcion?: Subscription;
  private readonly clientes = new Set<SocketTiraAfloja>();
  private stopping = false;
  private readonly log = new Logger(TiraAflojaGateway.name);

  constructor(
    private readonly juego: TiraAflojaService,
    private readonly autenticacion: TiraAflojaWsAuthService,
    private readonly actualizaciones: TiraAflojaRealtimePublisher,
    private readonly presencia: TiraAflojaPresenceService,
  ) {}

  afterInit(): void {
    this.suscripcion = this.actualizaciones.observar().subscribe((cambio) => {
      this.servidor.to(salaPartida(cambio.partidaId)).emit('tira:actualizada', {
        partidaId: cambio.partidaId,
        servidorAhora: cambio.fecha.toISOString(),
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    this.suscripcion?.unsubscribe();
    await Promise.all(
      [...this.clientes].map(async (c) => {
        await c.data.renewing;
        if (c.data.partidaId && c.data.presenceId)
          await this.presencia
            .observe(c.data.partidaId, c.data.presenceId, 'UNCERTAIN')
            .catch(() =>
              this.log.error(
                'TUG_OBSERVER_STOP_UNRECORDED: lease will become UNKNOWN.',
              ),
            );
      }),
    );
  }

  async handleConnection(cliente: SocketTiraAfloja): Promise<void> {
    try {
      this.clientes.add(cliente);
      cliente.data.presenceId = undefined;
      cliente.prependListener('disconnect', (reason: string) => {
        cliente.data.disconnectReason = reason;
      });
      cliente.conn.on('packet', (packet) => {
        if (packet.type === 'pong')
          void this.renovar(cliente).catch(() =>
            this.log.error(
              'TUG_AUTHENTICATED_OBSERVATION_FAILED: no grace invented.',
            ),
          );
      });
      const usuario = await this.autenticacion.autenticar(cliente);
      cliente.data.usuarioId = usuario.id;
      cliente.data.nombre = usuario.nombre;
      cliente.data.acciones = [];
      await cliente.join(salaUsuario(usuario.id));

      const estado = await this.juego.obtenerActiva(usuario.id);
      if (estado) {
        await this.unirAPartida(
          cliente,
          estado.partida.id,
          estado.partida.lado,
        );
      }
      cliente.emit('tira:conectado', {
        servidorAhora: new Date().toISOString(),
        partidaId: estado?.partida.id ?? null,
        version: estado?.partida.version ?? null,
        recuperada: estado !== null,
      });
      if (estado) cliente.emit('tira:estado', estado);
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : 'No fue posible autenticarte.';
      cliente.emit('tira:error', {
        codigo: 'NO_AUTORIZADO',
        mensaje,
      });
      cliente.disconnect(true);
    }
  }

  async handleDisconnect(cliente: SocketTiraAfloja): Promise<void> {
    this.clientes.delete(cliente);
    const { usuarioId, partidaId, lado } = cliente.data;
    if (!usuarioId || !partidaId || !lado || !this.servidor) return;
    if (cliente.data.presenceId) {
      await cliente.data.renewing;
      try {
        const confirmed =
          !this.stopping &&
          ['client namespace disconnect', 'transport close'].includes(
            cliente.data.disconnectReason ?? '',
          );
        await this.presencia.observe(
          partidaId,
          cliente.data.presenceId,
          confirmed ? 'DISCONNECT' : 'UNCERTAIN',
        );
        this.servidor.to(salaPartida(partidaId)).emit('tira:presencia', {
          usuarioId: lado,
          conectado: await this.presencia.isOpen(partidaId, usuarioId),
          servidorAhora: new Date().toISOString(),
        });
      } catch {
        this.log.error(
          'TUG_DISCONNECT_UNRECORDED: no backdating; lease becomes UNKNOWN.',
        );
      }
      return;
    }
    const conexiones = await this.servidor
      .in(salaUsuario(usuarioId))
      .fetchSockets();
    if (conexiones.length > 0) return;
    this.servidor.to(salaPartida(partidaId)).emit('tira:presencia', {
      usuarioId: lado,
      conectado: false,
      servidorAhora: new Date().toISOString(),
    });
  }

  @SubscribeMessage('tira:emparejar')
  async emparejar(
    @ConnectedSocket() cliente: SocketTiraAfloja,
    @MessageBody() entrada: EmparejarWsDto,
  ) {
    this.limitar(cliente);
    const estado = await this.juego.emparejar(
      this.usuarioId(cliente),
      entrada.area,
    );
    await this.unirAPartida(cliente, estado.partida.id, estado.partida.lado);
    cliente.emit('tira:estado', estado);
    return { ok: true, version: estado.partida.version };
  }

  @SubscribeMessage('tira:sincronizar')
  async sincronizar(
    @ConnectedSocket() cliente: SocketTiraAfloja,
    @MessageBody() entrada: SincronizarWsDto,
  ) {
    this.limitar(cliente);
    const estado = await this.juego.obtener(
      this.usuarioId(cliente),
      entrada.partidaId,
      entrada.desdeVersion,
    );
    await this.unirAPartida(cliente, entrada.partidaId, estado.partida.lado);
    cliente.emit('tira:estado', estado);
    return { ok: true, version: estado.partida.version };
  }

  @SubscribeMessage('tira:listo')
  async marcarListo(
    @ConnectedSocket() cliente: SocketTiraAfloja,
    @MessageBody() entrada: PartidaWsDto,
  ) {
    this.limitar(cliente);
    const estado = await this.juego.marcarListo(
      this.usuarioId(cliente),
      entrada.partidaId,
    );
    cliente.emit('tira:estado', estado);
    return { ok: true, version: estado.partida.version };
  }

  @SubscribeMessage('tira:responder')
  async responder(
    @ConnectedSocket() cliente: SocketTiraAfloja,
    @MessageBody() entrada: ResponderWsDto,
  ) {
    this.limitar(cliente);
    await this.renovar(cliente, true);
    const estado = await this.juego.responder(
      this.usuarioId(cliente),
      entrada.partidaId,
      entrada,
    );
    cliente.emit('tira:estado', estado);
    return { ok: true, version: estado.partida.version };
  }

  @SubscribeMessage('tira:abandonar')
  async abandonar(
    @ConnectedSocket() cliente: SocketTiraAfloja,
    @MessageBody() entrada: PartidaWsDto,
  ) {
    this.limitar(cliente);
    const estado = await this.juego.abandonar(
      this.usuarioId(cliente),
      entrada.partidaId,
    );
    cliente.emit('tira:estado', estado);
    return { ok: true, version: estado.partida.version };
  }

  @SubscribeMessage('tira:latido')
  async latido(@ConnectedSocket() cliente: SocketTiraAfloja) {
    this.limitar(cliente);
    await this.renovar(cliente);
    return { servidorAhora: new Date().toISOString() };
  }

  private usuarioId(cliente: SocketTiraAfloja): string {
    if (!cliente.data.usuarioId) {
      throw new HttpException('Socket no autenticado.', 401);
    }
    return cliente.data.usuarioId;
  }

  private async unirAPartida(
    cliente: SocketTiraAfloja,
    partidaId: string,
    lado: 'A' | 'B',
  ): Promise<void> {
    if (cliente.data.partidaId && cliente.data.partidaId !== partidaId) {
      if (cliente.data.presenceId)
        await this.presencia.observe(
          cliente.data.partidaId,
          cliente.data.presenceId,
          'UNCERTAIN',
        );
      cliente.data.presenceId = undefined;
      await cliente.leave(salaPartida(cliente.data.partidaId));
    }
    cliente.data.partidaId = partidaId;
    cliente.data.lado = lado;
    if (
      !cliente.data.presenceId &&
      (await this.presencia.enrolled(partidaId))
    ) {
      const user = await this.autenticacion.autenticar(cliente);
      if (user.id !== this.usuarioId(cliente))
        throw new HttpException('Identidad de conexión cambió.', 401);
      const id = randomUUID();
      const state = await this.presencia.connect(
        user.id,
        partidaId,
        id,
        user.expiresAt,
      );
      if (state !== 'LEGACY') {
        if (state !== 'OPEN')
          throw new HttpException('Partida terminal o cierre pendiente.', 409);
        cliente.data.presenceId = id;
      }
    } else if (cliente.data.presenceId) await this.renovar(cliente);
    await cliente.join(salaPartida(partidaId));
    cliente.to(salaPartida(partidaId)).emit('tira:presencia', {
      usuarioId: lado,
      conectado: true,
      servidorAhora: new Date().toISOString(),
    });
  }

  private renovar(
    cliente: SocketTiraAfloja,
    allowRetry = false,
  ): Promise<void> {
    if (!cliente.data.presenceId || !cliente.data.partidaId || this.stopping)
      return Promise.resolve();
    if (cliente.data.renewing) return cliente.data.renewing;
    cliente.data.renewing = (async () => {
      try {
        const user = await this.autenticacion.autenticar(cliente);
        if (user.id !== this.usuarioId(cliente))
          throw new HttpException('Identidad cambió.', 401);
        const state = await this.presencia.observe(
          cliente.data.partidaId!,
          cliente.data.presenceId!,
          'RENEW',
        );
        // The game recovers exact retries first; an UNKNOWN connection still
        // cannot admit a new answer through its PostgreSQL guard.
        if (state !== 'OPEN' && !allowRetry)
          throw new HttpException('Reconexión autenticada requerida.', 409);
      } catch (error) {
        await this.presencia
          .observe(
            cliente.data.partidaId!,
            cliente.data.presenceId!,
            'UNCERTAIN',
          )
          .catch(() => undefined);
        throw error;
      }
    })().finally(() => {
      cliente.data.renewing = undefined;
    });
    return cliente.data.renewing;
  }

  private limitar(cliente: SocketTiraAfloja): void {
    const ahora = Date.now();
    const recientes = (cliente.data.acciones ?? []).filter(
      (fecha) => ahora - fecha < VENTANA_LIMITE_MS,
    );
    if (recientes.length >= MAX_ACCIONES_POR_VENTANA) {
      throw new HttpException(
        'Demasiadas acciones en tiempo real. Espera unos segundos.',
        429,
      );
    }
    recientes.push(ahora);
    cliente.data.acciones = recientes;
  }
}
