import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  StreamableFile,
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

  @Get(':id/logo/:revision')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async logo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('revision', ParseIntPipe) revision: number,
  ) {
    return new StreamableFile(await this.service.logo(id, revision), {
      type: 'image/webp',
    });
  }
}
