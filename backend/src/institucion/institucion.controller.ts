import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Request,
  UseGuards,
  Param,
  Delete,
  UseInterceptors,
  UseFilters,
  UploadedFile,
  BadRequestException,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { IsJsonBoolean } from '../common/is-json-boolean';
import { AuthenticatedRequest } from '../auth/auth.types';
import { FileInterceptor } from '@nestjs/platform-express';
import { InstitucionService } from './institucion.service';
import { GrupoService } from './grupo.service';
import { EstudianteService } from './estudiante.service';
import { EstudianteImportService } from './estudiante-import.service';
import { ArchivoAlmacenamientoService } from './archivo-almacenamiento.service';
import { AlertasRiesgoService } from './alertas-riesgo.service';
import { VinculoInstitucionService } from './vinculo-institucion.service';
import { AdministracionInstitucionService } from './administracion-institucion.service';
import { VinculacionGrupoService } from './vinculacion-grupo.service';
import { AnaliticaBasicaService } from './analitica-basica.service';
import { AnaliticaDetalladaService } from './analitica-detallada.service';
import { ReporteInstitucionalService } from './reporte-institucional.service';
import {
  AdministradorInstitucionGuard,
  JwtGuard,
  ProfesorInstitucionGuard,
  PropietarioInstitucionGuard,
} from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { logoMulterOptions } from './logo-upload.config';
import { csvMulterOptions } from './csv-upload.config';
import { MulterExceptionFilter } from './multer-exception.filter';
import {
  IsEmail,
  Equals,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import {
  CONTRASENA_SEGURA_MENSAJE,
  CONTRASENA_SEGURA_REGEX,
} from '../common/password-policy';

class CrearInstitucionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensajeBienvenida?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;
}

class ActualizarInstitucionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensajeBienvenida?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;
}

class CrearEstudianteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre!: string;

  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsString()
  @Matches(CONTRASENA_SEGURA_REGEX, {
    message: CONTRASENA_SEGURA_MENSAJE,
  })
  contrasena!: string;

  @IsOptional()
  @IsString()
  claseId?: string;
}

class CrearGrupoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nombre!: string;

  @IsIn(['DECIMO', 'ONCE'])
  grado!: 'DECIMO' | 'ONCE';
}

class ActualizarGrupoDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  nombre?: string;
}

class AgregarEstudianteExistenteDto {
  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsOptional()
  @IsString()
  claseId?: string;
}

class AgregarEstudianteAGrupoDto {
  @IsString()
  @IsNotEmpty()
  estudianteId!: string;
}

class UnirseClaseDto {
  @IsString()
  @IsNotEmpty()
  codigoIngreso!: string;
}

class CrearCodigoTemporalGrupoDto {
  @IsInt()
  @Min(15)
  @Max(10080)
  duracionMinutos!: number;

  @IsInt()
  @Min(1)
  @Max(200)
  usosMaximos!: number;
}

class CodigoTemporalGrupoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  codigo!: string;
}

class AceptarCodigoTemporalGrupoDto extends CodigoTemporalGrupoDto {
  @IsJsonBoolean()
  @Equals(true, { message: 'Debes aceptar explícitamente el vínculo.' })
  acepto!: true;
}

class AsignarProfesorGrupoDto {
  @IsString()
  @IsNotEmpty()
  miembroId!: string;
}

class SolicitarIngresoInstitucionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  codigoInstitucion!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mensaje?: string;
}

class RevisarSolicitudInstitucionDto {
  @IsIn(['APROBAR', 'RECHAZAR'])
  decision!: 'APROBAR' | 'RECHAZAR';
}

class CrearInvitacionInstitucionDto {
  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsIn(['ADMINISTRADOR', 'PROFESOR'])
  rol!: 'ADMINISTRADOR' | 'PROFESOR';
}

class ResponderInvitacionInstitucionDto {
  @IsIn(['ACEPTAR', 'RECHAZAR'])
  respuesta!: 'ACEPTAR' | 'RECHAZAR';
}

class CambiarRolInstitucionDto {
  @IsIn(['ADMINISTRADOR', 'PROFESOR'])
  rol!: 'ADMINISTRADOR' | 'PROFESOR';
}

class TransferirPropiedadDto {
  @IsString()
  @IsNotEmpty()
  miembroId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  codigoConfirmacion!: string;
}

@Controller('instituciones')
@UseGuards(JwtGuard)
export class InstitucionController {
  constructor(
    private readonly institucionService: InstitucionService,
    private readonly grupoService: GrupoService,
    private readonly estudianteService: EstudianteService,
    private readonly estudianteImportService: EstudianteImportService,
    private readonly archivoAlmacenamientoService: ArchivoAlmacenamientoService,
    private readonly alertasRiesgoService: AlertasRiesgoService,
    private readonly vinculoInstitucionService: VinculoInstitucionService,
    private readonly administracionInstitucionService: AdministracionInstitucionService,
    private readonly vinculacionGrupoService: VinculacionGrupoService,
    private readonly analiticaBasicaService: AnaliticaBasicaService,
    private readonly analiticaDetalladaService: AnaliticaDetalladaService,
    private readonly reporteInstitucionalService: ReporteInstitucionalService,
  ) {}

  @Get('profesor/contexto')
  obtenerContextoProfesor(@Request() req: AuthenticatedRequest) {
    return this.vinculoInstitucionService.obtenerContextoProfesor(
      req.usuario.sub,
    );
  }

  @Post('solicitudes')
  @UseGuards(EmailVerificadoGuard)
  solicitarIngreso(
    @Body() body: SolicitarIngresoInstitucionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.vinculoInstitucionService.solicitarIngreso(
      req.usuario.sub,
      body.codigoInstitucion,
      body.mensaje,
    );
  }

  @Delete('solicitudes/me')
  cancelarSolicitud(@Request() req: AuthenticatedRequest) {
    return this.vinculoInstitucionService.cancelarSolicitud(req.usuario.sub);
  }

  @Get('invitaciones/me')
  obtenerMisInvitaciones(@Request() req: AuthenticatedRequest) {
    return this.administracionInstitucionService.obtenerMisInvitaciones(
      req.usuario.sub,
    );
  }

  @Post('invitaciones/:id/responder')
  @UseGuards(EmailVerificadoGuard)
  responderInvitacion(
    @Param('id') id: string,
    @Body() body: ResponderInvitacionInstitucionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.administracionInstitucionService.responderInvitacion(
      req.usuario.sub,
      id,
      body.respuesta === 'ACEPTAR',
    );
  }

  @Get('me/administracion')
  obtenerAdministracion(@Request() req: AuthenticatedRequest) {
    return this.administracionInstitucionService.obtenerPanel(req.usuario.sub);
  }

  @Patch('me/solicitudes/:id')
  revisarSolicitud(
    @Param('id') id: string,
    @Body() body: RevisarSolicitudInstitucionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.administracionInstitucionService.revisarSolicitud(
      req.usuario.sub,
      id,
      body.decision,
    );
  }

  @Post('me/invitaciones')
  crearInvitacion(
    @Body() body: CrearInvitacionInstitucionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.administracionInstitucionService.crearInvitacion(
      req.usuario.sub,
      body.correo,
      body.rol,
    );
  }

  @Delete('me/invitaciones/:id')
  cancelarInvitacion(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.administracionInstitucionService.cancelarInvitacion(
      req.usuario.sub,
      id,
    );
  }

  @Patch('me/miembros/:id/rol')
  cambiarRolMiembro(
    @Param('id') id: string,
    @Body() body: CambiarRolInstitucionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.administracionInstitucionService.cambiarRol(
      req.usuario.sub,
      id,
      body.rol,
    );
  }

  @Delete('me/miembros/:id')
  retirarMiembro(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.administracionInstitucionService.retirarMiembro(
      req.usuario.sub,
      id,
    );
  }

  @Post('me/transferir-propiedad')
  transferirPropiedad(
    @Body() body: TransferirPropiedadDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.administracionInstitucionService.transferirPropiedad(
      req.usuario.sub,
      body.miembroId,
      body.codigoConfirmacion,
    );
  }

  @Get('me')
  obtenerMiInstitucion(@Request() req: AuthenticatedRequest) {
    return this.institucionService.obtenerMiInstitucion(req.usuario.sub);
  }

  @Post('unirse')
  unirseAClase(
    @Body() body: UnirseClaseDto,
    @Request() req: AuthenticatedRequest,
  ) {
    void body;
    void req;
    return this.grupoService.unirseAClase();
  }

  @Post('grupos/vista-previa')
  vistaPreviaGrupo(
    @Body() body: CodigoTemporalGrupoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.vinculacionGrupoService.vistaPrevia(
      req.usuario.sub,
      body.codigo,
    );
  }

  @Post('grupos/aceptar')
  @UseGuards(EmailVerificadoGuard)
  aceptarGrupo(
    @Body() body: AceptarCodigoTemporalGrupoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.vinculacionGrupoService.aceptarIngreso(
      req.usuario.sub,
      body.codigo,
      body.acepto,
    );
  }

  @Get('grupos/estudiante')
  obtenerGruposDelEstudiante(@Request() req: AuthenticatedRequest) {
    return this.vinculacionGrupoService.obtenerMisGrupos(req.usuario.sub);
  }

  @Post()
  @UseGuards(EmailVerificadoGuard)
  crearInstitucion(
    @Body() body: CrearInstitucionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.institucionService.crearInstitucion(
      req.usuario.sub,
      body.nombre,
      body.mensajeBienvenida,
      body.logoUrl,
    );
  }

  @Patch('me')
  @UseGuards(AdministradorInstitucionGuard)
  actualizarMiInstitucion(
    @Body() body: ActualizarInstitucionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.institucionService.actualizarMiInstitucion(
      req.usuario.sub,
      body.nombre,
      body.mensajeBienvenida,
      body.logoUrl,
    );
  }

  @Delete('me')
  @UseGuards(PropietarioInstitucionGuard)
  eliminarMiInstitucion(@Request() req: AuthenticatedRequest) {
    return this.institucionService.eliminarMiInstitucion(req.usuario.sub);
  }

  @Post('me/logo')
  @UseGuards(AdministradorInstitucionGuard)
  @UseInterceptors(FileInterceptor('logo', logoMulterOptions))
  @UseFilters(MulterExceptionFilter)
  subirLogo(
    @UploadedFile() archivo: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!archivo) {
      throw new BadRequestException(
        'Debes seleccionar una imagen para el logo.',
      );
    }

    return this.archivoAlmacenamientoService.subirLogoDeMiInstitucion(
      req.usuario.sub,
      archivo,
    );
  }

  @Delete('me/logo')
  @UseGuards(AdministradorInstitucionGuard)
  eliminarLogo(@Request() req: AuthenticatedRequest) {
    return this.archivoAlmacenamientoService.eliminarLogoDeMiInstitucion(
      req.usuario.sub,
    );
  }

  @Get('me/estudiantes')
  @UseGuards(ProfesorInstitucionGuard)
  obtenerEstudiantes(@Request() req: AuthenticatedRequest) {
    return this.estudianteService.obtenerEstudiantesDeMiInstitucion(
      req.usuario.sub,
    );
  }

  @Get('me/analiticas')
  @UseGuards(ProfesorInstitucionGuard)
  obtenerAnaliticas(@Request() req: AuthenticatedRequest) {
    return this.analiticaDetalladaService.obtener(req.usuario.sub);
  }

  @Get('me/analiticas-basicas')
  @UseGuards(ProfesorInstitucionGuard)
  obtenerAnaliticasBasicas(@Request() req: AuthenticatedRequest) {
    return this.analiticaBasicaService.obtener(req.usuario.sub);
  }

  @Get('me/alertas-riesgo')
  @UseGuards(ProfesorInstitucionGuard)
  obtenerAlertasRiesgo(@Request() req: AuthenticatedRequest) {
    return this.alertasRiesgoService.obtenerAlertas(req.usuario.sub);
  }

  @Get('me/exportaciones/analitica.csv')
  @UseGuards(ProfesorInstitucionGuard)
  async exportarAnaliticaCsv(
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reporte = await this.reporteInstitucionalService.generarCsv(
      req.usuario.sub,
    );
    this.configurarDescarga(response, reporte.nombre, reporte.tipoContenido);
    return new StreamableFile(reporte.archivo);
  }

  @Get('me/exportaciones/analitica.pdf')
  @UseGuards(ProfesorInstitucionGuard)
  async exportarAnaliticaPdf(
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const reporte = await this.reporteInstitucionalService.generarPdf(
      req.usuario.sub,
    );
    this.configurarDescarga(response, reporte.nombre, reporte.tipoContenido);
    return new StreamableFile(reporte.archivo);
  }

  @Post('me/estudiantes')
  @UseGuards(ProfesorInstitucionGuard)
  crearEstudiante(
    @Body() body: CrearEstudianteDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.estudianteService.crearEstudianteEnMiInstitucion(
      req.usuario.sub,
      body.nombre,
      body.correo,
      body.contrasena,
      body.claseId,
    );
  }

  @Post('me/estudiantes/agregar')
  @UseGuards(ProfesorInstitucionGuard)
  agregarEstudianteExistente(
    @Body() body: AgregarEstudianteExistenteDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.estudianteService.agregarEstudianteExistenteAMiInstitucion(
      req.usuario.sub,
      body.correo,
      body.claseId,
    );
  }

  @Post('me/estudiantes/importar-csv')
  @UseGuards(ProfesorInstitucionGuard)
  @UseInterceptors(FileInterceptor('archivo', csvMulterOptions))
  @UseFilters(MulterExceptionFilter)
  importarEstudiantesCsv(
    @UploadedFile() archivo: Express.Multer.File,
    @Body('claseId') claseId: string | undefined,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!archivo) {
      throw new BadRequestException('Debes seleccionar un archivo CSV.');
    }

    return this.estudianteImportService.importarEstudiantesCsv(
      req.usuario.sub,
      archivo,
      claseId || undefined,
    );
  }

  @Get('me/grupos')
  @UseGuards(ProfesorInstitucionGuard)
  obtenerGrupos(@Request() req: AuthenticatedRequest) {
    return this.grupoService.obtenerGruposDeMiInstitucion(req.usuario.sub);
  }

  @Post('me/grupos')
  @UseGuards(ProfesorInstitucionGuard)
  crearGrupo(
    @Body() body: CrearGrupoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.grupoService.crearGrupoEnMiInstitucion(
      req.usuario.sub,
      body.nombre,
      body.grado,
    );
  }

  @Post('me/grupos/:id/codigos')
  @UseGuards(ProfesorInstitucionGuard)
  crearCodigoTemporalGrupo(
    @Param('id') id: string,
    @Body() body: CrearCodigoTemporalGrupoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.vinculacionGrupoService.crearCodigo(
      req.usuario.sub,
      id,
      body.duracionMinutos,
      body.usosMaximos,
    );
  }

  @Delete('me/grupos/:id/codigos/:codigoId')
  @UseGuards(ProfesorInstitucionGuard)
  revocarCodigoTemporalGrupo(
    @Param('id') id: string,
    @Param('codigoId') codigoId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.vinculacionGrupoService.revocarCodigo(
      req.usuario.sub,
      id,
      codigoId,
    );
  }

  @Post('me/grupos/:id/profesores')
  @UseGuards(ProfesorInstitucionGuard)
  asignarProfesorGrupo(
    @Param('id') id: string,
    @Body() body: AsignarProfesorGrupoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.grupoService.asignarProfesor(
      req.usuario.sub,
      id,
      body.miembroId,
    );
  }

  @Delete('me/grupos/:id/profesores/:miembroId')
  @UseGuards(ProfesorInstitucionGuard)
  quitarProfesorGrupo(
    @Param('id') id: string,
    @Param('miembroId') miembroId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.grupoService.quitarProfesor(req.usuario.sub, id, miembroId);
  }

  @Patch('me/grupos/:id')
  @UseGuards(ProfesorInstitucionGuard)
  editarGrupo(
    @Param('id') id: string,
    @Body() body: ActualizarGrupoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.grupoService.actualizarGrupo(req.usuario.sub, id, body.nombre);
  }

  @Delete('me/grupos/:id')
  @UseGuards(ProfesorInstitucionGuard)
  eliminarGrupo(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.grupoService.eliminarGrupo(req.usuario.sub, id);
  }

  @Post('me/grupos/:id/estudiantes')
  @UseGuards(ProfesorInstitucionGuard)
  agregarEstudianteAGrupo(
    @Param('id') id: string,
    @Body() body: AgregarEstudianteAGrupoDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.grupoService.agregarEstudianteAGrupo(
      req.usuario.sub,
      id,
      body.estudianteId,
    );
  }

  @Delete('me/grupos/:id/estudiantes/:estudianteId')
  @UseGuards(ProfesorInstitucionGuard)
  quitarEstudianteDeGrupo(
    @Param('id') id: string,
    @Param('estudianteId') estudianteId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.grupoService.quitarEstudianteDeGrupo(
      req.usuario.sub,
      id,
      estudianteId,
    );
  }

  private configurarDescarga(
    response: Response,
    nombre: string,
    tipoContenido: string,
  ) {
    response.setHeader('Content-Type', tipoContenido);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${nombre}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }
}
