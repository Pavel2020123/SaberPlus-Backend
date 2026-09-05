import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { SimulacroService } from './simulacro.service';
import { TemaPdfService } from './tema-pdf.service';
import { AreaIcfes, Dificultad, OrigenRespuesta } from '@prisma/client';
import { AdminGuard, JwtGuard } from '../auth/jwt.guard';
import { PlanVigenteGuard } from '../auth/plan-vigente.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  ValidateNested,
  IsInt,
  IsOptional,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

class RespuestaDto {
  @IsString()
  @IsNotEmpty()
  preguntaId!: string;

  @IsString()
  @IsNotEmpty()
  respuestaId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7200)
  tiempoRespuestaSegundos?: number;
}

class CalificarDto {
  @IsUUID()
  intentoId!: string;

  @IsEnum(AreaIcfes)
  area!: AreaIcfes;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RespuestaDto)
  respuestas!: RespuestaDto[];

  @IsOptional()
  @IsEnum(OrigenRespuesta)
  origen?: OrigenRespuesta;
}

class CalificarPersonalizadoDto {
  @IsUUID()
  intentoId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RespuestaDto)
  respuestas!: RespuestaDto[];
}

class ProgresoDto {
  @IsString()
  @IsNotEmpty()
  subtemaId!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  porcentaje!: number;
}

@Controller('simulacros')
export class SimulacroController {
  constructor(
    private readonly simulacroService: SimulacroService,
    private readonly temaPdfService: TemaPdfService,
  ) {}

  // GET /simulacros/generar?area=MATEMATICAS
  @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
  @Get('generar')
  obtenerSimulacro(
    @Query('area', new ParseEnumPipe(AreaIcfes)) area: AreaIcfes,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.simulacroService.generarSimulacro(req.usuario.sub, area);
  }

  // POST /simulacros/calificar  ← Ruta protegida con JWT
  // Body: { area: "MATEMATICAS", respuestas: [{ preguntaId: "...", respuestaId: "..." }] }
  @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
  @Post('calificar')
  calificar(@Body() body: CalificarDto, @Request() req: AuthenticatedRequest) {
    const usuarioId = req.usuario.sub; // viene del JWT token
    return this.simulacroService.calificarSimulacro(
      usuarioId,
      body.intentoId,
      body.area,
      body.respuestas,
      body.origen === OrigenRespuesta.PRACTICA
        ? OrigenRespuesta.PRACTICA
        : OrigenRespuesta.SIMULACRO,
    );
  }
  // GET /simulacros/generar-personalizado?areas=MATEMATICAS,LECTURA_CRITICA&cantidad=20&dificultad=MEDIO
  // "Preguntas aleatorias": el estudiante elige 1 o varias áreas.
  @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
  @Get('generar-personalizado')
  generarPersonalizado(
    @Query('areas') areas: string,
    @Query('cantidad', new ParseIntPipe({ optional: true })) cantidad?: number,
    @Query('dificultad', new ParseEnumPipe(Dificultad, { optional: true }))
    dificultad?: Dificultad,
    @Request() req?: AuthenticatedRequest,
  ) {
    const listaAreas = (areas ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter((a): a is AreaIcfes =>
        Object.values(AreaIcfes).includes(a as AreaIcfes),
      );

    if (listaAreas.length === 0) {
      throw new BadRequestException(
        'Debes indicar al menos un área válida para generar el simulacro.',
      );
    }

    return this.simulacroService.generarSimulacroPersonalizado(
      req.usuario.sub,
      listaAreas,
      cantidad && Number.isFinite(cantidad) && cantidad > 0
        ? Math.min(cantidad, 100)
        : 20,
      dificultad,
    );
  }

  // POST /simulacros/calificar-personalizado ← Ruta protegida con JWT
  // Body: { respuestas: [{ preguntaId: "...", respuestaId: "..." }] }
  // No requiere "area": se calcula por pregunta y se guarda el desglose.
  @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
  @Post('calificar-personalizado')
  calificarPersonalizado(
    @Body() body: CalificarPersonalizadoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const usuarioId = req.usuario.sub;
    return this.simulacroService.calificarSimulacroPersonalizado(
      usuarioId,
      body.intentoId,
      body.respuestas,
    );
  }

  // GET /simulacros/historial  ← Ruta protegida con JWT
  @UseGuards(JwtGuard)
  @Get('historial')
  historial(@Request() req: AuthenticatedRequest) {
    const usuarioId = req.usuario.sub;

    return this.simulacroService.obtenerHistorial(usuarioId);
  }

  @UseGuards(JwtGuard)
  @Get('historial-respuestas')
  historialRespuestas(
    @Request() req: AuthenticatedRequest,
    @Query('area', new ParseEnumPipe(AreaIcfes, { optional: true }))
    area?: AreaIcfes,
    @Query('resultado') resultado?: string,
    @Query('limite', new ParseIntPipe({ optional: true })) limite?: number,
  ) {
    const esCorrecta =
      resultado === 'correctas'
        ? true
        : resultado === 'incorrectas'
          ? false
          : undefined;
    return this.simulacroService.obtenerHistorialRespuestas(
      req.usuario.sub,
      area,
      esCorrecta,
      limite,
    );
  }

  // POST /simulacros/poblar  ← Solo para desarrollo
  @UseGuards(JwtGuard, AdminGuard)
  @Post('poblar')
  poblarBd() {
    return this.simulacroService.poblarBaseDeDatos();
  }

  // GET /simulacros/temas?area=MATEMATICAS
  @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
  @Get('temas')
  obtenerTemas(@Query('area') area: AreaIcfes) {
    return this.simulacroService.obtenerTemasPorArea(area);
  }

  @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
  @Get('temas/:temaId/pdf')
  async descargarTemaPdf(
    @Param('temaId') temaId: string,
    @Res({ passthrough: true }) respuesta: Response,
  ) {
    const pdf = await this.temaPdfService.generarPdfTema(temaId);
    respuesta.setHeader('Content-Type', 'application/pdf');
    respuesta.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdf.nombre}"`,
    );
    respuesta.setHeader('Content-Length', String(pdf.archivo.length));
    return new StreamableFile(pdf.archivo);
  }

  // GET /simulacros/preguntas/:subtemaId
  @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
  @Get('preguntas/:subtemaId')
  obtenerPreguntasPorSubtema(
    @Param('subtemaId') subtemaId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.simulacroService.obtenerPreguntasPorSubtema(
      req.usuario.sub,
      subtemaId,
    );
  }

  // POST /simulacros/progreso  ← Marcar tema como visto
  @UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
  @Post('progreso')
  actualizarProgreso(
    @Body() body: ProgresoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const usuarioId = req.usuario.sub;
    return this.simulacroService.actualizarProgresoTema(
      usuarioId,
      body.subtemaId,
      body.porcentaje,
    );
  }

  // GET /simulacros/progreso  ← Ver progreso general
  @UseGuards(JwtGuard)
  @Get('progreso')
  obtenerProgreso(@Request() req: AuthenticatedRequest) {
    const usuarioId = req.usuario.sub;

    return this.simulacroService.obtenerProgresoGeneral(usuarioId);
  }
}
