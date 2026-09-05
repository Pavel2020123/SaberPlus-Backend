import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { PlanVigenteGuard } from '../auth/plan-vigente.guard';
import { PlanEstudioService } from './plan-estudio.service';

@Controller('plan-estudio')
@UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
export class PlanEstudioController {
  constructor(private readonly planEstudioService: PlanEstudioService) {}

  @Get('semanal')
  obtenerPlanSemanal(@Request() req: AuthenticatedRequest) {
    return this.planEstudioService.obtenerPlanSemanal(req.usuario.sub);
  }
}
