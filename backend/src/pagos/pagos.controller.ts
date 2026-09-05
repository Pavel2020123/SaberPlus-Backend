import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PagosService } from './pagos.service';
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

class CrearOrdenDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  codigoCupon?: string;
}

@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  // Sin EmailVerificadoGuard a propósito: la verificación de correo
  // existe para no dejar reiniciar la prueba GRATIS con correos falsos
  // (punto 7), no para bloquear a alguien que ya va a pagar de verdad.
  // Solo necesitamos que tenga sesión (JwtGuard).
  @UseGuards(JwtGuard)
  @Post('crear-orden')
  crearOrden(
    @Body() body: CrearOrdenDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.pagosService.crearOrden(req.usuario.sub, body.codigoCupon);
  }

  // ─── WEBHOOK PÚBLICO: lo invoca ePayco servidor a servidor ────
  // Sin JwtGuard a propósito: ePayco no manda nuestro token, manda su
  // propia firma (signature), que es lo que valida PagosService.
  @Post('confirmacion')
  @HttpCode(200)
  confirmacion(@Body() body: Record<string, string>) {
    return this.pagosService.confirmarPago(body);
  }

  // Usado por la página de respuesta del frontend para saber si el
  // webhook (que es la fuente confiable) ya actualizó la orden.
  @UseGuards(JwtGuard)
  @Get('estado/:factura')
  estado(
    @Param('factura') factura: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.pagosService.obtenerEstadoOrden(req.usuario.sub, factura);
  }
}
