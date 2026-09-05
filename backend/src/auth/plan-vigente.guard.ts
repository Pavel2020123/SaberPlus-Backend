import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { planEstudianteVencido } from './plan.util';
import { AuthenticatedRequest } from './auth.types';

// ─── GUARD: MURO DE PAGO DEL ESTUDIANTE INDIVIDUAL ──────────
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
      select: { institucionId: true, rol: true, fechaVencimientoPlan: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (planEstudianteVencido(usuario)) {
      throw new ForbiddenException({
        codigo: 'PLAN_VENCIDO',
        mensaje:
          'Tu prueba gratuita de 3 días terminó. Activa el acceso completo por un único pago de $45.000 y sigue preparándote para el ICFES.',
      });
    }

    return true;
  }
}
