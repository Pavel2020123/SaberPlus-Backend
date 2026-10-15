import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { GuardarRespuestasVocacionalesDto } from './orientacion-vocacional.dto';
import { OrientacionVocacionalService } from './orientacion-vocacional.service';

@Controller('orientacion-vocacional')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class OrientacionVocacionalController {
  constructor(private readonly service: OrientacionVocacionalService) {}

  private vacio(body: unknown) {
    if (body != null && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length))
      throw new BadRequestException('No se admiten parámetros en el cuerpo.');
  }

  @Get()
  actual(@Req() req: AuthenticatedRequest) { return this.service.actual(req.usuario!.sub); }

  @Get('cuestionario')
  cuestionario(@Req() req: AuthenticatedRequest) { return this.service.cuestionario(req.usuario!.sub); }

  @Post('intentos')
  iniciar(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    this.vacio(body);
    return this.service.iniciar(req.usuario!.sub);
  }

  @Get('historial')
  historial(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).some(k => k !== 'pagina') ||
        (query.pagina !== undefined && (typeof query.pagina !== 'string' || !/^[1-9]\d{0,5}$/.test(query.pagina))))
      throw new BadRequestException('Página inválida.');
    return this.service.historial(req.usuario!.sub, query.pagina ? Number(query.pagina) : 1);
  }

  @Get('intentos/:id')
  obtener(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.obtener(req.usuario!.sub, id);
  }

  @Patch('intentos/:id/respuestas')
  guardar(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GuardarRespuestasVocacionalesDto) {
    return this.service.guardar(req.usuario!.sub, id, body.respuestas);
  }

  @Post('intentos/:id/finalizar')
  @HttpCode(200)
  finalizar(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    this.vacio(body);
    return this.service.finalizar(req.usuario!.sub, id);
  }

  @Delete('intentos/:id')
  @HttpCode(204)
  eliminar(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.eliminar(req.usuario!.sub, id);
  }
}
