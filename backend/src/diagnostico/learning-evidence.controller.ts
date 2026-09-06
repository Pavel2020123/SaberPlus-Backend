import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { LearningEvidenceService } from './learning-evidence.service';

@Controller('diagnostico-evidencia')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class LearningEvidenceController {
  constructor(private readonly evidence: LearningEvidenceService) {}

  @Get()
  obtener(@Request() req: AuthenticatedRequest) {
    // No user ID from query/body, and no paid-plan gate for academic evidence.
    return this.evidence.obtener(req.usuario.sub);
  }
}
