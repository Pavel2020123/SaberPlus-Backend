import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseEnumPipe,
} from '@nestjs/common';
import { CalendarioIcfesService } from './calendario-icfes.service';
import { JwtGuard, AdminGuard } from '../auth/jwt.guard';
import { CalendarioTipo } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNotEmpty } from 'class-validator';

class CrearFechaDto {
  @IsInt()
  anio!: number;

  @IsEnum(CalendarioTipo)
  calendario!: CalendarioTipo;

  @IsDateString()
  @IsNotEmpty()
  fechaExamen!: string; // ISO, ej. "2027-11-14"
}

class ActualizarFechaDto {
  @IsDateString()
  @IsNotEmpty()
  fechaExamen!: string;
}

@Controller('calendario-icfes')
export class CalendarioIcfesController {
  constructor(private readonly service: CalendarioIcfesService) {}

  @Get('activo')
  async activo() {
    return { calendario: await this.service.obtenerCalendarioActivo() };
  }

  // Público (requiere solo login) — lo consume el countdown del estudiante.
  @Get('proxima')
  @UseGuards(JwtGuard)
  proxima(
    @Query('calendario', new ParseEnumPipe(CalendarioTipo))
    calendario: CalendarioTipo,
  ) {
    return this.service.obtenerProximaFecha(calendario);
  }

  // ─── ADMIN ──────────────────────────────────────────────────
  @Get('admin')
  @UseGuards(AdminGuard)
  listar() {
    return this.service.listar();
  }

  @Post('admin')
  @UseGuards(AdminGuard)
  crear(@Body() body: CrearFechaDto) {
    return this.service.crear(
      body.anio,
      body.calendario,
      new Date(body.fechaExamen),
    );
  }

  @Patch('admin/:id')
  @UseGuards(AdminGuard)
  actualizar(@Param('id') id: string, @Body() body: ActualizarFechaDto) {
    return this.service.actualizar(id, new Date(body.fechaExamen));
  }

  @Patch('admin/:id/activar')
  @UseGuards(AdminGuard)
  activar(@Param('id') id: string) {
    return this.service.activar(id);
  }

  @Delete('admin/:id')
  @UseGuards(AdminGuard)
  eliminar(@Param('id') id: string) {
    return this.service.eliminar(id);
  }
}
