import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { requiereVerificacionCorreo } from './verificacion.util';
import { AuthenticatedRequest } from './auth.types';

// ─── GUARD: CORREO VERIFICADO ────────────────────────────────
// Se usa DESPUÉS de JwtGuard, igual que PlanVigenteGuard:
//   @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
@Injectable()
export class EmailVerificadoGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const usuarioId = request.usuario?.sub;

    if (!usuarioId) {
      throw new UnauthorizedException(
        'No hay token. Inicia sesión para continuar.',
      );
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { institucionId: true, rol: true, correoVerificado: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (requiereVerificacionCorreo(usuario)) {
      throw new ForbiddenException({
        codigo: 'CORREO_NO_VERIFICADO',
        mensaje:
          'Confirma tu correo para continuar. Revisa tu bandeja de entrada.',
      });
    }

    return true;
  }
}
