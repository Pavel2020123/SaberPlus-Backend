import { OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { isUUID } from 'class-validator';
import { randomUUID } from 'crypto';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { TiraAflojaWsAuthService } from '../tira-afloja/tira-afloja-ws-auth.service';
import { TriviaPresenceService } from './trivia-presence.service';
import { parseAllowedOrigins } from '../config/runtime-environment';

// Reuse only JWT/student authentication, never Tira's gameplay or presence.
// No Engine.IO global timer changes: other namespaces keep their transport settings.
@WebSocketGateway({
  namespace: '/trivia-presence',
  // Nest may create the shared Engine.IO server from either namespace first.
  // Keep the existing Tira transport options identical; 120s recovery is NOT game grace.
  transports: ['websocket'],
  maxHttpBufferSize: 100_000,
  pingInterval: 25_000,
  pingTimeout: 20_000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120_000,
    skipMiddlewares: false,
  },
  cors: {
    origin: parseAllowedOrigins(
      process.env.ALLOWED_ORIGINS?.trim() ||
        process.env.FRONTEND_URL?.trim() ||
        'http://localhost:3001',
    ),
    methods: ['GET', 'POST'],
  },
})
export class TriviaPresenceGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly sockets = new Map<
    Socket,
    { attemptId: string; connectionId: string }
  >();
  private stopping = false;
  private running?: Promise<void>;
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    private readonly authentication: TiraAflojaWsAuthService,
    private readonly db: PrismaService,
    private readonly presence: TriviaPresenceService,
  ) {
    this.timer = setInterval(() => {
      if (!this.running && !this.stopping)
        this.running = this.renew().finally(() => {
          this.running = undefined;
        });
    }, 5000);
    this.timer.unref();
  }
  async handleConnection(socket: Socket) {
    try {
      const user = await this.authentication.autenticar(socket);
      const attemptId: unknown = socket.handshake.auth?.attemptId;
      if (typeof attemptId !== 'string' || !isUUID(attemptId))
        throw new Error('Invalid attempt');
      const attempt = await this.db.intentoTriviaRush.findUnique({
        where: { id: attemptId },
      });
      if (
        !attempt ||
        attempt.usuarioId !== user.id ||
        attempt.presenciaVersion !== 1
      )
        throw new Error('Not authorized');
      if (!socket.connected || this.stopping) return;
      const connection = { attemptId: attempt.id, connectionId: randomUUID() };
      this.sockets.set(socket, connection);
      const state = await this.presence.connect(
        user.id,
        attempt.id,
        connection.connectionId,
      );
      if (!socket.connected || this.stopping) {
        await this.presence.observe(
          attempt.id,
          connection.connectionId,
          this.stopping ? 'UNCERTAIN' : 'DISCONNECT',
        );
        this.sockets.delete(socket);
        socket.disconnect();
        return;
      }
      socket.emit('trivia:presencia', { estado: state });
      if (state !== 'ACTIVO') {
        this.sockets.delete(socket);
        socket.disconnect();
      }
    } catch {
      await this.uncertain(socket);
      socket.emit('trivia:error', {
        codigo: 'PRESENCE_UNAVAILABLE_OR_UNAUTHORIZED',
      });
      socket.disconnect();
    }
  }
  async handleDisconnect(socket: Socket) {
    const c = this.sockets.get(socket);
    this.sockets.delete(socket);
    if (!c) return;
    try {
      await this.presence.observe(
        c.attemptId,
        c.connectionId,
        this.stopping ? 'UNCERTAIN' : 'DISCONNECT',
      );
    } catch {
      // Never backdate/retry a lost observation as a later client disconnect.
      // Durable OPEN becomes UNKNOWN when its observer lease expires.
    }
  }
  private async uncertain(socket: Socket) {
    const c = this.sockets.get(socket);
    this.sockets.delete(socket);
    if (c) {
      try {
        await this.presence.observe(c.attemptId, c.connectionId, 'UNCERTAIN');
      } catch {
        /* lease fallback */
      }
    }
  }
  private async renew() {
    for (const [socket, c] of this.sockets) {
      if (this.stopping) break;
      if (!socket.connected) continue;
      try {
        await this.authentication.autenticar(socket);
        const state = await this.presence.observe(
          c.attemptId,
          c.connectionId,
          'RENEW',
        );
        if (state !== 'ACTIVO') {
          this.sockets.delete(socket);
          socket.emit('trivia:presencia', { estado: state });
          socket.disconnect();
        }
      } catch {
        await this.uncertain(socket);
        socket.disconnect();
      }
    }
  }
  async onModuleDestroy() {
    this.stopping = true;
    clearInterval(this.timer);
    await this.running;
    for (const socket of this.sockets.keys()) await this.uncertain(socket);
  }
}
