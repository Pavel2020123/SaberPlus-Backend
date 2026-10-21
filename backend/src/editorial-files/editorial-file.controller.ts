import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AdminGuard } from '../auth/jwt.guard';
import { MulterExceptionFilter } from '../institucion/multer-exception.filter';
import { UploadEditorialFileDto } from './editorial-file.dto';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileService } from './editorial-file.service';
import { EditorialFileStorageFilter } from './editorial-file-storage.filter';
import { EDITORIAL_INPUT_LIMIT } from './editorial-image';

@Controller('admin/archivos')
@UseGuards(AdminGuard, EditorialFileRuntime)
@UseFilters(MulterExceptionFilter, EditorialFileStorageFilter)
export class EditorialFileController {
  constructor(private readonly files: EditorialFileService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: {
        fileSize: EDITORIAL_INPUT_LIMIT,
        files: 1,
        fields: 7,
        parts: 8,
        fieldSize: 8000,
      },
    }),
  )
  upload(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UploadEditorialFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Selecciona una imagen.');
    return this.files.upload(req.usuario.sub, dto, file.buffer);
  }

  @Get('operaciones/:operacionId')
  @Header('Cache-Control', 'private, no-store')
  receipt(
    @Request() req: AuthenticatedRequest,
    @Param('operacionId', new ParseUUIDPipe({ version: '4' }))
    operationId: string,
  ) {
    return this.files.receipt(req.usuario.sub, operationId);
  }

  @Get(':id/contenido')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async content(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return new StreamableFile(await this.files.content(id), {
      type: 'image/webp',
      disposition: 'inline; filename="imagen.webp"',
    });
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.files.detail(id);
  }

  @Delete(':id')
  @Header('Cache-Control', 'private, no-store')
  retire(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.files.retire(id);
  }
}
