import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RolUsuario } from '@prisma/client';
import { Socket } from 'socket.io';
import { JwtPayload } from '../auth/auth.types';
import { requiereVerificacionCorreo } from '../auth/verificacion.util';
import { PrismaService } from '../prisma/prisma.service';
import { requireChangedInitialPassword } from '../auth/initial-password-access';

export interface UsuarioSocketTiraAfloja {
  id: string;
  nombre: string;
  expiresAt?: Date;
}

@Injectable()
export class TiraAflojaWsAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async autenticar(cliente: Socket): Promise<UsuarioSocketTiraAfloja> {
    const token = this.extraerToken(cliente);
    if (!token) {
      throw new UnauthorizedException(
        'Envia el access token en handshake.auth.token.',
      );
    }

    let payload: JwtPayload & { exp?: number };
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token invalido o expirado.');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        nombre: true,
        rol: true,
        institucionId: true,
        correoVerificado: true,
        debeCambiarContrasena: true,
      },
    });
    if (!usuario) {
      throw new UnauthorizedException('La sesion ya no es valida.');
    }
    if (usuario.rol !== RolUsuario.ESTUDIANTE) {
      throw new ForbiddenException(
        'Tira y afloja solo admite cuentas de estudiante.',
      );
    }
    requireChangedInitialPassword(usuario.debeCambiarContrasena);
    if (requiereVerificacionCorreo(usuario)) {
      throw new ForbiddenException('Debes verificar tu correo para jugar.');
    }
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      ...(typeof payload.exp === 'number'
        ? { expiresAt: new Date(payload.exp * 1000) }
        : {}),
    };
  }

  private extraerToken(cliente: Socket): string | undefined {
    const autenticacion = cliente.handshake.auth as unknown;
    const tokenAuth =
      typeof autenticacion === 'object' &&
      autenticacion !== null &&
      'token' in autenticacion
        ? autenticacion.token
        : undefined;
    if (typeof tokenAuth === 'string' && tokenAuth.trim()) {
      return tokenAuth.replace(/^Bearer\s+/i, '').trim();
    }
    const authorization = cliente.handshake.headers.authorization;
    if (typeof authorization !== 'string') return undefined;
    const [tipo, token] = authorization.split(' ');
    return tipo.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}
