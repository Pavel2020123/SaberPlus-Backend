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
import { JwtGuard } from '../auth/jwt.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { MulterExceptionFilter } from '../institucion/multer-exception.filter';
import { PrivateFileRuntime } from './private-file-runtime';
import { PRIVATE_FILE_INPUT_LIMIT } from './private-file-content';
import {
  ProfilePhotoRevisionDto,
  UploadProfilePhotoDto,
} from './profile-photo.dto';
import { ProfilePhotoService } from './profile-photo.service';

@Controller('cuenta/archivos')
@UseGuards(JwtGuard, PrivateFileRuntime)
@UseFilters(MulterExceptionFilter)
export class ProfilePhotoController {
  constructor(private readonly photos: ProfilePhotoService) {}

  @Get('foto')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  own(@Request() req: AuthenticatedRequest) {
    return this.photos.own(req.usuario);
  }

  @Get('operaciones/:operacionId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  operation(
    @Request() req: AuthenticatedRequest,
    @Param('operacionId', new ParseUUIDPipe({ version: '4' }))
    operation: string,
  ) {
    return this.photos.operation(req.usuario, operation);
  }

  @Get('foto/:id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async content(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return new StreamableFile(await this.photos.content(req.usuario, id), {
      type: 'image/webp',
      disposition: 'inline; filename="foto.webp"',
    });
  }

  @Post('operaciones/:operacionId/reintentar-retirada')
  @Header('Cache-Control', 'private, no-store')
  retryRemoval(
    @Request() req: AuthenticatedRequest,
    @Param('operacionId', new ParseUUIDPipe({ version: '4' }))
    operation: string,
  ) {
    return this.photos.retryRemoval(req.usuario, operation);
  }

  @Post('operaciones/:operacionId/cancelar')
  @Header('Cache-Control', 'private, no-store')
  cancel(
    @Request() req: AuthenticatedRequest,
    @Param('operacionId', new ParseUUIDPipe({ version: '4' }))
    operation: string,
  ) {
    return this.photos.cancel(req.usuario, operation);
  }

  @Post('foto')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: {
        fileSize: PRIVATE_FILE_INPUT_LIMIT,
        files: 1,
        fields: 2,
        parts: 3,
        fieldSize: 100,
      },
    }),
  )
  upload(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UploadProfilePhotoDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Selecciona una imagen.');
    return this.photos.upload(req.usuario, dto, file.buffer);
  }

  @Delete('foto')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  remove(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ProfilePhotoRevisionDto,
  ) {
    return this.photos.remove(req.usuario, dto.revision);
  }
}
