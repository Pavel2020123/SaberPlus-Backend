import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsJsonBoolean } from '../common/is-json-boolean';
import { AdminGuard } from '../auth/jwt.guard';
import { SoporteService } from './soporte.service';

class ActualizarSoporteDto {
  @IsOptional()
  @IsString()
  @MaxLength(25)
  numeroWhatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  mensajeWhatsapp?: string;

  @IsOptional()
  @IsJsonBoolean()
  activo?: boolean;
}

@Controller('soporte')
export class SoporteController {
  constructor(private readonly soporteService: SoporteService) {}

  @Get()
  obtenerPublica() {
    return this.soporteService.obtenerPublica();
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  obtenerAdmin() {
    return this.soporteService.obtenerAdmin();
  }

  @Patch('admin')
  @UseGuards(AdminGuard)
  actualizar(@Body() body: ActualizarSoporteDto) {
    return this.soporteService.actualizar(body);
  }
}
