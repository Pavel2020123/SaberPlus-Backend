import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AreaIcfes } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';
import { AdminGuard } from '../auth/jwt.guard';
import { AcademicCatalogService } from './academic-catalog.service';

export class CatalogPageDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pagina = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite = 50;
}

export class CatalogThemesDto extends CatalogPageDto {
  @IsEnum(AreaIcfes)
  area!: AreaIcfes;
}

export class CatalogSubthemesDto extends CatalogPageDto {
  @IsString()
  @IsNotEmpty()
  temaId!: string;
}

@Controller('admin/catalogo')
@UseGuards(AdminGuard)
export class AcademicCatalogController {
  constructor(private readonly catalog: AcademicCatalogService) {}

  @Get('areas')
  areas() {
    return this.catalog.areas();
  }

  @Get('temas')
  temas(@Query() query: CatalogThemesDto) {
    return this.catalog.temas(query.area, query.pagina, query.limite);
  }

  @Get('subtemas')
  subtemas(@Query() query: CatalogSubthemesDto) {
    return this.catalog.subtemas(query.temaId, query.pagina, query.limite);
  }
}
