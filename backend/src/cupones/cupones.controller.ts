import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TipoPlan } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminGuard, JwtGuard } from '../auth/jwt.guard';
import { CuponesService } from './cupones.service';

class ValidarCuponQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  codigo!: string;

  @IsEnum(TipoPlan)
  tipoPlan!: TipoPlan;
}

class PromocionActivaQueryDto {
  @IsEnum(TipoPlan)
  tipoPlan!: TipoPlan;
}

class CrearCuponDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/)
  codigo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titulo?: string;

  @IsOptional()
  @IsBoolean()
  esAutomatica?: boolean;

  @IsInt()
  @Min(1)
  @Max(99)
  porcentajeDescuento!: number;

  @IsOptional()
  @IsIn(['MENSUAL'])
  tipoPlan?: TipoPlan;

  @IsDateString()
  @IsNotEmpty()
  fechaExpiracion!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  usosMaximos?: number;
}

class ActualizarCuponDto {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titulo?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  porcentajeDescuento?: number;

  @IsOptional()
  @IsIn(['MENSUAL'])
  tipoPlan?: TipoPlan | null;

  @IsOptional()
  @IsDateString()
  fechaExpiracion?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  usosMaximos?: number | null;
}

@Controller('cupones')
export class CuponesController {
  constructor(private readonly cuponesService: CuponesService) {}

  @Get('promocion-activa')
  async promocionActiva(@Query() query: PromocionActivaQueryDto) {
    return {
      promocion: await this.cuponesService.obtenerPromocionActiva(
        query.tipoPlan,
      ),
    };
  }

  @Get('validar')
  @UseGuards(JwtGuard)
  validar(@Query() query: ValidarCuponQueryDto) {
    return this.cuponesService.validar(query.codigo, query.tipoPlan);
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  listar() {
    return this.cuponesService.listar();
  }

  @Post('admin')
  @UseGuards(AdminGuard)
  crear(@Body() body: CrearCuponDto) {
    return this.cuponesService.crear({
      ...body,
      fechaExpiracion: new Date(body.fechaExpiracion),
    });
  }

  @Patch('admin/:id')
  @UseGuards(AdminGuard)
  actualizar(@Param('id') id: string, @Body() body: ActualizarCuponDto) {
    return this.cuponesService.actualizar(id, {
      ...body,
      fechaExpiracion: body.fechaExpiracion
        ? new Date(body.fechaExpiracion)
        : undefined,
    });
  }

  @Delete('admin/:id')
  @UseGuards(AdminGuard)
  eliminar(@Param('id') id: string) {
    return this.cuponesService.eliminar(id);
  }
}
