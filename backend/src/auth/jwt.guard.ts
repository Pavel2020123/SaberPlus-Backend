import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest, JwtPayload } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  INITIAL_PASSWORD_ACCESS,
  requireChangedInitialPassword,
} from './initial-password-access';

// ─── GUARD PARA USUARIOS LOGUEADOS ──────────────────────────
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private reflector: Reflector = new Reflector(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extraerToken(request);

    if (!token) {
      throw new UnauthorizedException(
        'No hay token. Inicia sesión para continuar.',
      );
    }

    let cambioInicialPendiente = false;
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const usuario = await this.prisma.usuario.findUnique({
        where: { id: payload.sub },
        select: {
          correo: true,
          nombre: true,
          rol: true,
          institucionId: true,
          debeCambiarContrasena: true,
        },
      });
      if (!usuario?.rol) {
        throw new UnauthorizedException('La sesión ya no es válida.');
      }
      cambioInicialPendiente = usuario.debeCambiarContrasena === true;
      request.usuario = {
        sub: payload.sub,
        correo: usuario.correo,
        nombre: usuario.nombre,
        rol: usuario.rol,
        institucionId: usuario.institucionId ?? undefined,
      };
    } catch {
      throw new UnauthorizedException('Token inválido o expirado.');
    }

    if (
      cambioInicialPendiente &&
      this.reflector.get<boolean>(
        INITIAL_PASSWORD_ACCESS,
        context.getHandler(),
      ) !== true
    ) {
      requireChangedInitialPassword(cambioInicialPendiente);
    }
    return true;
  }

  private extraerToken(request: AuthenticatedRequest): string | undefined {
    const [tipo, token] = request.headers.authorization?.split(' ') ?? [];
    return tipo === 'Bearer' ? token : undefined;
  }
}

// ─── GUARD SOLO PARA ADMINS ─────────────────────────────────
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extraerToken(request);

    if (!token && !request.usuario) {
      throw new UnauthorizedException('No hay token.');
    }

    let payload = request.usuario;
    if (!payload) {
      try {
        payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      } catch {
        throw new UnauthorizedException('Token inválido o expirado.');
      }
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        correo: true,
        nombre: true,
        rol: true,
        institucionId: true,
        debeCambiarContrasena: true,
      },
    });
    if (!usuario) {
      throw new UnauthorizedException('La sesión ya no es válida.');
    }
    if (usuario.rol !== 'ADMIN') {
      throw new ForbiddenException('No tienes permiso de administrador.');
    }
    requireChangedInitialPassword(usuario.debeCambiarContrasena);

    request.usuario = {
      sub: payload.sub,
      correo: usuario.correo,
      nombre: usuario.nombre,
      rol: 'ADMIN',
      institucionId: usuario.institucionId ?? undefined,
    };
    return true;
  }

  private extraerToken(request: AuthenticatedRequest): string | undefined {
    const [tipo, token] = request.headers.authorization?.split(' ') ?? [];
    return tipo === 'Bearer' ? token : undefined;
  }
}

@Injectable()
export class ProfesorInstitucionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const payload = request.usuario;
    if (!payload) {
      throw new UnauthorizedException('Debes iniciar sesión.');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: {
        correo: true,
        nombre: true,
        rol: true,
        institucionId: true,
      },
    });
    if (!usuario) {
      throw new UnauthorizedException('La sesión ya no es válida.');
    }
    if (usuario.rol !== 'PROFESOR' && usuario.rol !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo un profesor o administrador puede gestionar la institución.',
      );
    }
    if (!usuario.institucionId) {
      throw new ForbiddenException('No perteneces a una institución.');
    }

    request.usuario = {
      sub: payload.sub,
      correo: usuario.correo,
      nombre: usuario.nombre,
      rol: usuario.rol,
      institucionId: usuario.institucionId,
    };
    return true;
  }
}

@Injectable()
export class AdministradorInstitucionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const usuarioId = request.usuario?.sub;
    if (!usuarioId) throw new UnauthorizedException('Debes iniciar sesión.');

    const membresia = await this.prisma.miembroInstitucion.findUnique({
      where: { usuarioId },
      select: { rol: true, institucionId: true },
    });
    if (
      !membresia ||
      (membresia.rol !== 'PROPIETARIO' && membresia.rol !== 'ADMINISTRADOR')
    ) {
      throw new ForbiddenException(
        'Necesitas permisos administrativos en la institución.',
      );
    }
    request.usuario.institucionId = membresia.institucionId;
    return true;
  }
}

@Injectable()
export class PropietarioInstitucionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const usuarioId = request.usuario?.sub;
    if (!usuarioId) throw new UnauthorizedException('Debes iniciar sesión.');

    const membresia = await this.prisma.miembroInstitucion.findUnique({
      where: { usuarioId },
      select: { rol: true, institucionId: true },
    });
    if (!membresia || membresia.rol !== 'PROPIETARIO') {
      throw new ForbiddenException(
        'Solo el propietario puede realizar esta acción.',
      );
    }
    request.usuario.institucionId = membresia.institucionId;
    return true;
  }
}
