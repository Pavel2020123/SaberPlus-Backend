import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { requireInstitutionOperational } from './institution-approval.policy';

export const InstitutionReviewAccess = () =>
  SetMetadata('institution-review-access', true);
@Injectable()
export class InstitutionOperationalGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.get<boolean>(
        'institution-review-access',
        context.getHandler(),
      )
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    // JwtGuard ya leyó la institución de la cuenta desde PostgreSQL.
    const id = request.usuario?.institucionId;
    if (id)
      requireInstitutionOperational(
        await this.prisma.institucion.findUnique({
          where: { id },
          select: { estadoVerificacion: true, transicionHasta: true },
        }),
      );
    return true;
  }
}
