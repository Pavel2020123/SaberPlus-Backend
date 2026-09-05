import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  ParseEnumPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminService } from './admin.service';
import { ContentLifecycleService } from './content-lifecycle.service';
import { ContentImportService } from './content-import.service';
import { contentImportMulterOptions } from './content-import-upload.config';
import { AdminGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { MulterExceptionFilter } from '../institucion/multer-exception.filter';
import {
  AreaIcfes,
  CalendarioTipo,
  Dificultad,
  EstadoContenido,
  TipoInteractivo,
} from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CONTRASENA_SEGURA_MENSAJE,
  CONTRASENA_SEGURA_REGEX,
} from '../common/password-policy';

class CambiarRolDto {
  @IsIn(['ESTUDIANTE', 'PROFESOR', 'ADMIN'])
  rol!: 'ESTUDIANTE' | 'PROFESOR' | 'ADMIN';
}

class CrearTemaDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsEnum(AreaIcfes)
  area!: AreaIcfes;
}

class CambiarEstadoContenidoDto {
  @IsEnum(EstadoContenido)
  estadoContenido!: EstadoContenido;
}

class CrearSubtemaDto {
  @IsString()
  @IsNotEmpty()
  nombre!: string;

  @IsString()
  @IsNotEmpty()
  temaId!: string;
}

class RespuestaDto {
  @IsString()
  @IsNotEmpty()
  texto!: string;

  @IsBoolean()
  esCorrecta!: boolean;

  @IsOptional()
  @IsString()
  explicacion?: string;
}

class CrearPreguntaDto {
  @IsString()
  @IsNotEmpty()
  enunciado!: string;

  @IsString()
  @IsNotEmpty()
  subtemaId!: string;

  @IsEnum(Dificultad)
  dificultad!: Dificultad;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RespuestaDto)
  respuestas!: RespuestaDto[];

  @IsOptional()
  @IsString()
  imagenUrl?: string;

  @IsOptional()
  @IsString()
  explicacion?: string;

  @IsOptional()
  @IsString()
  casoId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ordenEnCaso?: number;
}

class CrearPreguntaAleatoriaDto {
  @IsEnum(AreaIcfes)
  area!: AreaIcfes;

  @IsString()
  @IsNotEmpty()
  enunciado!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RespuestaDto)
  respuestas!: RespuestaDto[];

  @IsOptional()
  @IsString()
  imagenUrl?: string;

  @IsOptional()
  @IsString()
  explicacion?: string;

  @IsOptional()
  @IsString()
  casoId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  ordenEnCaso?: number;
}

class CrearCasoPreguntaDto {
  @IsEnum(AreaIcfes)
  area!: AreaIcfes;

  @IsString()
  @IsNotEmpty()
  contexto!: string;

  @IsOptional()
  @IsString()
  titulo?: string;

  @IsOptional()
  @IsString()
  imagenUrl?: string;
}

class ActualizarCasoPreguntaDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  contexto?: string;

  @IsOptional()
  @IsString()
  titulo?: string;

  @IsOptional()
  @IsString()
  imagenUrl?: string;
}

class AsignarCasoPreguntaDto {
  @IsOptional()
  @IsString()
  casoId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  ordenEnCaso?: number;
}

class ActualizarContenidoDto {
  @IsOptional()
  @IsString()
  contenido?: string;

  @IsOptional()
  @IsString()
  videoUrl?: string;

  @IsOptional()
  @IsString()
  imagenUrl?: string;
}

class EspacioInteractivoDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  opciones!: string[];

  @IsNotEmpty()
  correctaIndex!: number;
}

class DatosInteractivoDto {
  @IsString()
  @IsNotEmpty()
  textoConEspacios!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EspacioInteractivoDto)
  espacios!: EspacioInteractivoDto[];
}

class ActualizarInteractivoDto {
  @IsEnum(TipoInteractivo)
  tipoInteractivo!: TipoInteractivo;

  @ValidateNested()
  @Type(() => DatosInteractivoDto)
  datosInteractivo!: DatosInteractivoDto;
}

// Punto 12: el administrador convierte un lead ya negociado en una
// institución operativa y crea su primer responsable (PROFESOR).
class CrearInstitucionDesdeLeadDto {
  @IsString()
  @IsNotEmpty()
  leadId!: string;

  @IsString()
  @Matches(CONTRASENA_SEGURA_REGEX, {
    message: CONTRASENA_SEGURA_MENSAJE,
  })
  contrasenaTemporal!: string;

  @IsOptional()
  @IsString()
  planActual?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limiteGrupos?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limiteEstudiantes?: number;

  @IsOptional()
  @IsEnum(CalendarioTipo)
  calendarioIcfes?: CalendarioTipo;

  @IsOptional()
  @IsDateString()
  fechaVencimientoPlan?: string;
}

class ActualizarPlanInstitucionalDto {
  @IsIn(['GRATIS', 'SIN_ANUNCIOS'])
  plan!: 'GRATIS' | 'SIN_ANUNCIOS';

  @IsOptional()
  @IsDateString()
  fechaVencimientoPlan?: string | null;
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly contentLifecycle: ContentLifecycleService,
    private readonly contentImport: ContentImportService,
  ) {}

  // Estadísticas
  @Get('estadisticas')
  estadisticas() {
    return this.adminService.obtenerEstadisticas();
  }

  // Usuarios
  @Get('usuarios')
  usuarios() {
    return this.adminService.obtenerUsuarios();
  }

  @Patch('usuarios/:id/rol')
  cambiarRol(@Param('id') id: string, @Body() body: CambiarRolDto) {
    return this.adminService.cambiarRol(id, body.rol);
  }

  @Delete('usuarios/:id')
  eliminarUsuario(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.eliminarUsuario(id, req.usuario.sub);
  }

  @Post('instituciones-desde-lead')
  crearInstitucionDesdeLead(@Body() body: CrearInstitucionDesdeLeadDto) {
    return this.adminService.crearInstitucionDesdeLead({
      ...body,
      fechaVencimientoPlan: body.fechaVencimientoPlan
        ? new Date(body.fechaVencimientoPlan)
        : undefined,
    });
  }

  @Patch('instituciones/:id/plan')
  actualizarPlanInstitucional(
    @Param('id') id: string,
    @Body() body: ActualizarPlanInstitucionalDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.adminService.actualizarPlanInstitucional(
      id,
      req.usuario.sub,
      body.plan,
      body.fechaVencimientoPlan ? new Date(body.fechaVencimientoPlan) : null,
    );
  }

  // Temas
  @Get('temas')
  temas() {
    return this.adminService.obtenerTemas();
  }

  @Post('temas')
  crearTema(@Body() body: CrearTemaDto) {
    return this.adminService.crearTema(body.nombre, body.area);
  }

  @Patch('temas/:id/estado')
  cambiarEstadoTema(
    @Param('id') id: string,
    @Body() body: CambiarEstadoContenidoDto,
  ) {
    return this.contentLifecycle.cambiarEstadoTema(id, body.estadoContenido);
  }

  @Delete('temas/:id')
  eliminarTema(@Param('id') id: string) {
    return this.adminService.eliminarTema(id);
  }

  // Subtemas
  @Post('subtemas')
  crearSubtema(@Body() body: CrearSubtemaDto) {
    return this.adminService.crearSubtema(body.nombre, body.temaId);
  }

  @Patch('subtemas/:id/estado')
  cambiarEstadoSubtema(
    @Param('id') id: string,
    @Body() body: CambiarEstadoContenidoDto,
  ) {
    return this.contentLifecycle.cambiarEstadoSubtema(id, body.estadoContenido);
  }

  @Delete('subtemas/:id')
  eliminarSubtema(@Param('id') id: string) {
    return this.adminService.eliminarSubtema(id);
  }

  // Preguntas
  @Get('preguntas/:subtemaId')
  preguntas(@Param('subtemaId') subtemaId: string) {
    return this.adminService.obtenerPreguntasPorSubtema(subtemaId);
  }

  @Get('preguntas/:id/estadisticas')
  estadisticasPregunta(@Param('id') id: string) {
    return this.adminService.obtenerEstadisticasPregunta(id);
  }

  @Post('preguntas')
  crearPregunta(@Body() body: CrearPreguntaDto) {
    return this.adminService.crearPregunta(
      body.enunciado,
      body.subtemaId,
      body.dificultad,
      body.respuestas,
      body.imagenUrl,
      body.explicacion,
      body.casoId,
      body.ordenEnCaso,
    );
  }

  // Preguntas aleatorias: carga rápida, solo pide el área (no subtema)
  @Post('preguntas-aleatorias')
  crearPreguntaAleatoria(@Body() body: CrearPreguntaAleatoriaDto) {
    return this.adminService.crearPreguntaAleatoria(
      body.area,
      body.enunciado,
      body.respuestas,
      body.imagenUrl,
      body.explicacion,
      body.casoId,
      body.ordenEnCaso,
    );
  }

  @Get('casos-preguntas')
  listarCasosPreguntas(
    @Query('area', new ParseEnumPipe(AreaIcfes, { optional: true }))
    area?: AreaIcfes,
  ) {
    return this.adminService.listarCasosPreguntas(area);
  }

  @Post('casos-preguntas')
  crearCasoPregunta(@Body() body: CrearCasoPreguntaDto) {
    return this.adminService.crearCasoPregunta(body);
  }

  @Patch('casos-preguntas/:id/estado')
  cambiarEstadoCasoPregunta(
    @Param('id') id: string,
    @Body() body: CambiarEstadoContenidoDto,
  ) {
    return this.contentLifecycle.cambiarEstadoCaso(id, body.estadoContenido);
  }

  @Patch('casos-preguntas/:id')
  actualizarCasoPregunta(
    @Param('id') id: string,
    @Body() body: ActualizarCasoPreguntaDto,
  ) {
    return this.adminService.actualizarCasoPregunta(id, body);
  }

  @Delete('casos-preguntas/:id')
  eliminarCasoPregunta(@Param('id') id: string) {
    return this.adminService.eliminarCasoPregunta(id);
  }

  @Patch('preguntas/:id/caso')
  asignarCasoPregunta(
    @Param('id') id: string,
    @Body() body: AsignarCasoPreguntaDto,
  ) {
    return this.adminService.asignarPreguntaACaso(
      id,
      body.casoId ?? null,
      body.ordenEnCaso,
    );
  }

  @Patch('preguntas/:id/estado')
  cambiarEstadoPregunta(
    @Param('id') id: string,
    @Body() body: CambiarEstadoContenidoDto,
  ) {
    return this.contentLifecycle.cambiarEstadoPregunta(
      id,
      body.estadoContenido,
    );
  }

  @Post('importaciones-contenido/previsualizar')
  @UseInterceptors(FileInterceptor('archivo', contentImportMulterOptions))
  @UseFilters(MulterExceptionFilter)
  previsualizarImportacionContenido(
    @UploadedFile() archivo: Express.Multer.File,
  ) {
    return this.contentImport.preview(archivo);
  }

  @Get('importaciones-contenido/formato')
  formatoImportacionContenido() {
    return this.contentImport.getFormat();
  }

  @Delete('preguntas/:id')
  eliminarPregunta(@Param('id') id: string) {
    return this.adminService.eliminarPregunta(id);
  }

  @Patch('subtemas/:id/contenido')
  actualizarContenido(
    @Param('id') id: string,
    @Body() body: ActualizarContenidoDto,
  ) {
    return this.adminService.actualizarContenidoSubtema(
      id,
      body.contenido,
      body.videoUrl,
      body.imagenUrl,
    );
  }

  // Ejercicio interactivo (cloze)
  @Patch('subtemas/:id/interactivo')
  actualizarInteractivo(
    @Param('id') id: string,
    @Body() body: ActualizarInteractivoDto,
  ) {
    return this.adminService.actualizarInteractivoSubtema(
      id,
      body.tipoInteractivo,
      body.datosInteractivo,
    );
  }
}
