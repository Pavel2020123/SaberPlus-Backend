import {
  Controller,
  Get,
  GoneException,
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
import { CertificadosCursoService } from './certificados-curso.service';

@Controller('gamificacion')
@UseGuards(JwtGuard)
export class GamificacionController {
  constructor(
    private readonly gamificacionService: GamificacionService,
    private readonly certificados: CertificadosCursoService,
  ) {}

  @Get('resumen')
  obtenerResumen(@Request() request: AuthenticatedRequest) {
    return this.gamificacionService.obtenerResumen(request.usuario.sub);
  }

  @Get('logros/:logroId/certificado')
  certificadoDeLogroRetirado() {
    throw new GoneException('Los logros son insignias. Los certificados se entregan solo por áreas y por el curso completo. Actualiza la aplicación.');
  }

  @Get('certificados')
  listarCertificados(@Request() request: AuthenticatedRequest) {
    return this.certificados.listar(request.usuario.sub);
  }

  @Get('certificados/:tipo/pdf')
  async descargarCertificado(
    @Request() request: AuthenticatedRequest,
    @Param('tipo') tipo: string,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const pdf = await this.certificados.generar(
      request.usuario.sub,
      tipo,
    );
    respuesta.setHeader('Content-Type', 'application/pdf');
    respuesta.setHeader('Cache-Control', 'private, no-store');
    respuesta.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdf.nombre}"`,
    );
    respuesta.setHeader('Content-Length', String(pdf.archivo.length));
    return new StreamableFile(pdf.archivo);
  }
}
