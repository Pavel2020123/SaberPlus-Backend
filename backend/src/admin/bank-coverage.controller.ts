import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/jwt.guard';
import { CatalogThemesDto } from './academic-catalog.controller';
import { BankCoverageService } from './bank-coverage.service';
import { Type } from 'class-transformer';
import { IsInt, Equals, ValidateIf } from 'class-validator';

/** Explicit opt-in: old panel strictly requires false/null and remains compatible. */
export class BankCoverageQuery extends CatalogThemesDto {
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Equals(1)
  reportesVersion?: number;
}

@Controller('admin/cobertura')
@UseGuards(AdminGuard)
export class BankCoverageController {
  constructor(private readonly coverage: BankCoverageService) {}
  @Get()
  get(@Query() query: BankCoverageQuery) {
    return this.coverage.page(
      query.area,
      query.pagina,
      query.limite,
      query.reportesVersion === 1,
    );
  }
}
