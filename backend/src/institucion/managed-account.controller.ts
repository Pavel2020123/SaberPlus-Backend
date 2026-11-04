import {
  Body,
  Controller,
  Get,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { InstitutionOperationalGuard } from './institution-operational.guard';
import { ManagedAccountService } from './managed-account.service';

class OperacionDto {
  @IsUUID() operacionId!: string;
}
class SolicitarSufijoDto extends OperacionDto {
  @IsString() @MaxLength(189) sufijo!: string;
}
class AprobarSufijoDto extends SolicitarSufijoDto {
  @IsInt() @Min(1) version!: number;
}
class CsvGestionadoDto {
  @IsString() @MaxLength(1048576) csv!: string;
  @IsUUID() claseId!: string;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) huella?: string;
}
class ConfirmarCsvDto extends CsvGestionadoDto {
  @IsUUID() operacionId!: string;
}
class ResetGestionadoDto extends OperacionDto {
  @IsUUID() usuarioId!: string;
}

@Controller('instituciones/:institucionId/cuentas-gestionadas')
@UseGuards(JwtGuard, InstitutionOperationalGuard)
export class ManagedAccountController {
  constructor(private readonly service: ManagedAccountService) {}

  @Get('contexto')
  @Header('Cache-Control', 'no-store')
  contexto(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
  ) {
    return this.service.contexto(req.usuario.sub, institucionId);
  }
  @Get('grupos')
  @Header('Cache-Control', 'no-store')
  grupos(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
  ) {
    return this.service.grupos(req.usuario.sub, institucionId);
  }
  @Get('alumnos')
  @Header('Cache-Control', 'no-store')
  alumnos(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
  ) {
    return this.service.alumnos(req.usuario.sub, institucionId, pagina);
  }

  @Get('sufijo')
  @Header('Cache-Control', 'no-store')
  consultar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
  ) {
    return this.service.consultarSufijo(req.usuario.sub, institucionId);
  }
  @Post('sufijo/solicitar')
  @Header('Cache-Control', 'no-store')
  solicitar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
    @Body() body: SolicitarSufijoDto,
  ) {
    return this.service.solicitarSufijo(
      req.usuario.sub,
      institucionId,
      body.operacionId,
      body.sufijo,
    );
  }
  @Post('sufijo/aprobar')
  @Header('Cache-Control', 'no-store')
  aprobar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
    @Body() body: AprobarSufijoDto,
  ) {
    return this.service.aprobarSufijo(
      req.usuario.sub,
      institucionId,
      body.operacionId,
      body.sufijo,
      body.version,
    );
  }
  @Post('previsualizar')
  @Header('Cache-Control', 'no-store')
  previsualizar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
    @Body() body: CsvGestionadoDto,
  ) {
    return this.service.previsualizar(req.usuario.sub, institucionId, body);
  }
  @Post('confirmar')
  @Header('Cache-Control', 'no-store')
  confirmar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
    @Body() body: ConfirmarCsvDto,
  ) {
    return this.service.importar(
      req.usuario.sub,
      institucionId,
      body.operacionId,
      body,
    );
  }
  @Post('restablecer')
  @Header('Cache-Control', 'no-store')
  restablecer(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) institucionId: string,
    @Body() body: ResetGestionadoDto,
  ) {
    return this.service.restablecer(
      req.usuario.sub,
      institucionId,
      body.operacionId,
      body.usuarioId,
    );
  }
}
