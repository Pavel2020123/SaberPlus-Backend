import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AudienciaAnuncio, TipoAnuncio } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import {
  AdminGuard,
  JwtGuard,
  ProfesorInstitucionGuard,
} from '../auth/jwt.guard';
import { AnunciosService } from './anuncios.service';

class CrearAnuncioDto {
  @IsString()
  @MaxLength(120)
  titulo!: string;

  @IsString()
  @MaxLength(3000)
  contenido!: string;

  @IsEnum(TipoAnuncio)
  tipo!: TipoAnuncio;

  @IsEnum(AudienciaAnuncio)
  audiencia!: AudienciaAnuncio;

  @IsISO8601()
  fechaInicio!: string;

  @IsOptional()
  @IsISO8601()
  fechaFin?: string | null;

  @IsBoolean()
  activo!: boolean;

  @IsBoolean()
  destacado!: boolean;
}

class ActualizarAnuncioDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titulo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  contenido?: string;

  @IsOptional()
  @IsEnum(TipoAnuncio)
  tipo?: TipoAnuncio;

  @IsOptional()
  @IsEnum(AudienciaAnuncio)
  audiencia?: AudienciaAnuncio;

  @IsOptional()
  @IsISO8601()
  fechaInicio?: string;

  @IsOptional()
  @IsISO8601()
  fechaFin?: string | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsBoolean()
  destacado?: boolean;
}

@Controller('anuncios')
export class AnunciosController {
  constructor(private readonly anunciosService: AnunciosService) {}

  @Get()
  @UseGuards(JwtGuard)
  listar(@Request() req: AuthenticatedRequest) {
    return this.anunciosService.listarParaUsuario(
      req.usuario.sub,
      req.usuario.rol,
      req.usuario.institucionId,
    );
  }

  @Patch('leer-todos')
  @UseGuards(JwtGuard)
  marcarTodosLeidos(@Request() req: AuthenticatedRequest) {
    return this.anunciosService.marcarTodosLeidos(
      req.usuario.sub,
      req.usuario.rol,
      req.usuario.institucionId,
    );
  }

  @Patch(':id/leer')
  @UseGuards(JwtGuard)
  marcarLeido(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.anunciosService.marcarLeido(
      id,
      req.usuario.sub,
      req.usuario.rol,
      req.usuario.institucionId,
    );
  }

  @Get('admin/listado')
  @UseGuards(AdminGuard)
  listarAdmin() {
    return this.anunciosService.listarAdmin();
  }

  @Post('admin')
  @UseGuards(AdminGuard)
  crear(@Body() body: CrearAnuncioDto, @Request() req: AuthenticatedRequest) {
    return this.anunciosService.crear(body, req.usuario.sub);
  }

  @Patch('admin/:id')
  @UseGuards(AdminGuard)
  actualizar(@Param('id') id: string, @Body() body: ActualizarAnuncioDto) {
    return this.anunciosService.actualizar(id, body);
  }

  @Delete('admin/:id')
  @UseGuards(AdminGuard)
  eliminar(@Param('id') id: string) {
    return this.anunciosService.eliminar(id);
  }

  @Get('institucion/listado')
  @UseGuards(JwtGuard, ProfesorInstitucionGuard)
  listarInstitucion(@Request() req: AuthenticatedRequest) {
    const institucionId = this.institucionProfesor(req);
    return this.anunciosService.listarInstitucion(institucionId);
  }

  @Post('institucion')
  @UseGuards(JwtGuard, ProfesorInstitucionGuard)
  crearInstitucion(
    @Body() body: CrearAnuncioDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.anunciosService.crearInstitucion(
      this.institucionProfesor(req),
      req.usuario.sub,
      body,
    );
  }

  @Patch('institucion/:id')
  @UseGuards(JwtGuard, ProfesorInstitucionGuard)
  actualizarInstitucion(
    @Param('id') id: string,
    @Body() body: ActualizarAnuncioDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.anunciosService.actualizarInstitucion(
      id,
      this.institucionProfesor(req),
      body,
    );
  }

  @Delete('institucion/:id')
  @UseGuards(JwtGuard, ProfesorInstitucionGuard)
  eliminarInstitucion(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.anunciosService.eliminarInstitucion(
      id,
      this.institucionProfesor(req),
    );
  }

  private institucionProfesor(req: AuthenticatedRequest) {
    return req.usuario.institucionId;
  }
}
