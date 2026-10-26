import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Request,
  StreamableFile,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { PlanVigenteGuard } from '../auth/plan-vigente.guard';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileService } from './editorial-file.service';
import { EditorialFileStorageFilter } from './editorial-file-storage.filter';

@Controller('recursos/editoriales')
@UseGuards(
  JwtGuard,
  EmailVerificadoGuard,
  PlanVigenteGuard,
  EditorialFileRuntime,
)
@UseFilters(EditorialFileStorageFilter)
export class EditorialResourceController {
  constructor(private readonly files: EditorialFileService) {}

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return new StreamableFile(
      await this.files.publishedContent(id, req.usuario.sub),
      {
        type: 'image/webp',
        disposition: 'inline; filename="imagen.webp"',
      },
    );
  }
}
