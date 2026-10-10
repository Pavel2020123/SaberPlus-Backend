import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { InstitutionDirectoryQuery } from './institution-directory.dto';
import { InstitutionDirectoryService } from './institution-directory.service';

// Consultable por cuentas autenticadas sin exigir pertenencia a una institución.
@Controller('instituciones/directorio')
@UseGuards(JwtGuard)
export class InstitutionDirectoryController {
  constructor(private readonly service: InstitutionDirectoryService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Query() query: InstitutionDirectoryQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.detail(id);
  }
}
