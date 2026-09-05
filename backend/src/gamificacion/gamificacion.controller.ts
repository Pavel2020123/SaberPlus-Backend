import {
  Controller,
  Get,
  Param,
  Request,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { GamificacionService } from './gamificacion.service';
import { CertificadoLogroService } from './certificado-logro.service';

@Controller('gamificacion')
@UseGuards(JwtGuard)
export class GamificacionController {
  constructor(
    private readonly gamificacionService: GamificacionService,
    private readonly certificadoLogroService: CertificadoLogroService,
  ) {}

  @Get('resumen')
  obtenerResumen(@Request() request: AuthenticatedRequest) {
    return this.gamificacionService.obtenerResumen(request.usuario.sub);
  }

  @Get('logros/:logroId/certificado')
  async descargarCertificado(
    @Request() request: AuthenticatedRequest,
    @Param('logroId') logroId: string,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const pdf = await this.certificadoLogroService.generar(
      request.usuario.sub,
      logroId,
    );
    respuesta.setHeader('Content-Type', 'application/pdf');
    respuesta.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdf.nombre}"`,
    );
    respuesta.setHeader('Content-Length', String(pdf.archivo.length));
    return new StreamableFile(pdf.archivo);
  }
}
