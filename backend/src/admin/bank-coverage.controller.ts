import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/jwt.guard';
import { CatalogThemesDto } from './academic-catalog.controller';
import { BankCoverageService } from './bank-coverage.service';

@Controller('admin/cobertura')
@UseGuards(AdminGuard)
export class BankCoverageController {
  constructor(private readonly coverage: BankCoverageService) {}
  @Get()
  get(@Query() query: CatalogThemesDto) {
    return this.coverage.page(query.area, query.pagina, query.limite);
  }
}
