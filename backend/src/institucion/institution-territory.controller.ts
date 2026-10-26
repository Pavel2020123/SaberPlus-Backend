import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { JwtGuard } from '../auth/jwt.guard';
import { InstitutionTerritoryService } from './institution-territory.service';

class DepartmentParam {
  @IsString()
  @Matches(/^\d{2}$/)
  departamentoCodigo!: string;
}
class NoTerritoryQuery {}

@Controller('instituciones/territorio')
@UseGuards(JwtGuard)
export class InstitutionTerritoryController {
  constructor(private readonly service: InstitutionTerritoryService) {}

  @Get('departamentos')
  @Header('Cache-Control', 'private, no-store')
  departments(@Query() _query: NoTerritoryQuery) {
    // Keep the DTO binding so ValidationPipe rejects unexpected query fields.
    void _query;
    return this.service.departments();
  }

  @Get('departamentos/:departamentoCodigo/municipios')
  @Header('Cache-Control', 'private, no-store')
  municipalities(
    @Param() params: DepartmentParam,
    @Query() _query: NoTerritoryQuery,
  ) {
    void _query;
    return this.service.municipalities(params.departamentoCodigo);
  }
}
