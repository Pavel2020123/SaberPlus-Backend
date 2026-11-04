import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { SupresionCuentaService } from './supresion-cuenta.service';

class SolicitudDto {
  @IsUUID('4') operacionId!: string;
  @IsUUID() usuarioId!: string;
  @IsString() @MaxLength(500) @Matches(/\S/) motivo!: string;
}
class RevisionDto {
  @IsInt() @Min(1) version!: number;
}
class EjecucionDto extends RevisionDto {
  @Matches(/^[a-f0-9]{64}$/) huellaRevision!: string;
  @IsString() @Matches(/^SUPRIMIR CUENTA$/) confirmacion!: string;
}

@Controller('cuentas/supresion')
@UseGuards(JwtGuard)
export class SupresionCuentaController {
  constructor(private readonly service: SupresionCuentaService) {}
  @Post()
  @Header('Cache-Control', 'private, no-store')
  solicitar(@Request() req: AuthenticatedRequest, @Body() dto: SolicitudDto) {
    return this.service.solicitar(
      req.usuario.sub,
      dto.usuarioId,
      dto.operacionId,
      dto.motivo,
    );
  }
  @Get()
  @Header('Cache-Control', 'private, no-store')
  listar(
    @Request() req: AuthenticatedRequest,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
  ) {
    return this.service.listar(req.usuario.sub, pagina);
  }
  @Get(':id/revision')
  @Header('Cache-Control', 'private, no-store')
  revisar(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revisar(req.usuario.sub, id);
  }
  @Post(':id/rechazar')
  @Header('Cache-Control', 'private, no-store')
  rechazar(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.service.rechazar(req.usuario.sub, id, dto.version);
  }

  @Post(':id/ejecutar')
  @Header('Cache-Control', 'private, no-store')
  ejecutar(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EjecucionDto,
  ) {
    return this.service.ejecutar(
      req.usuario.sub,
      id,
      dto.version,
      dto.huellaRevision,
      dto.confirmacion,
    );
  }
}
