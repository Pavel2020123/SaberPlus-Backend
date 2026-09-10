import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from './auth.types';

// Compatibilidad de rutas heredadas: el estudio es gratuito con anuncios.
// No concede Premium ni modifica los permisos/cupos institucionales.
// IMPORTANTE: siempre se usa DESPUÉS de JwtGuard, así:
//   @UseGuards(JwtGuard, PlanVigenteGuard)
// porque necesita que JwtGuard ya haya puesto el payload en request['usuario'].
@Injectable()
export class PlanVigenteGuard implements CanActivate {
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
      select: { id: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    return true;
  }
}
