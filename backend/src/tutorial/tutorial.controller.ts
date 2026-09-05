import { Controller, Get, Patch, Request, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { TutorialService } from './tutorial.service';

@Controller('tutorial')
@UseGuards(JwtGuard)
export class TutorialController {
  constructor(private readonly tutorialService: TutorialService) {}

  @Get('estado')
  obtenerEstado(@Request() req: AuthenticatedRequest) {
    return this.tutorialService.obtenerEstado(req.usuario.sub);
  }

  @Patch('completar')
  completar(@Request() req: AuthenticatedRequest) {
    return this.tutorialService.completar(req.usuario.sub);
  }
}
