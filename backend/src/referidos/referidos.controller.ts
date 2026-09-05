import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { ReferidosService } from './referidos.service';

@Controller('referidos')
export class ReferidosController {
  constructor(private readonly referidosService: ReferidosService) {}

  @Get('validar/:codigo')
  validar(@Param('codigo') codigo: string) {
    return this.referidosService.validarCodigo(codigo);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  obtenerResumen(@Request() req: AuthenticatedRequest) {
    return this.referidosService.obtenerResumen(req.usuario.sub);
  }

  @Get('mobile')
  @UseGuards(JwtGuard)
  obtenerResumenMovil(@Request() req: AuthenticatedRequest) {
    return this.referidosService.obtenerResumenMovil(req.usuario.sub);
  }
}
