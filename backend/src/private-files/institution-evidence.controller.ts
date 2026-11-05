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
import { InstitutionEvidenceService } from './institution-evidence.service';

@Controller('cuenta/archivos/evidencias/:solicitudId')
@UseGuards(JwtGuard, PrivateFileRuntime)
@UseFilters(MulterExceptionFilter)
export class InstitutionEvidenceController {
  constructor(private readonly evidence: InstitutionEvidenceService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Request() req: AuthenticatedRequest,
    @Param('solicitudId', new ParseUUIDPipe({ version: '4' })) request: string,
  ) {
    return this.evidence.list(req.usuario, request);
  }

  @Get('operaciones/:operacionId')
  @Header('Cache-Control', 'private, no-store')
  operation(
    @Request() req: AuthenticatedRequest,
    @Param('solicitudId', new ParseUUIDPipe({ version: '4' })) request: string,
    @Param('operacionId', new ParseUUIDPipe({ version: '4' }))
    operation: string,
  ) {
    return this.evidence.operation(req.usuario, request, operation);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "sandbox; default-src 'none'")
  async content(
    @Request() req: AuthenticatedRequest,
    @Param('solicitudId', new ParseUUIDPipe({ version: '4' })) request: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const file = await this.evidence.content(req.usuario, request, id);
    return new StreamableFile(file.content, {
      type: file.mime,
      disposition: `attachment; filename="documento.${file.mime === 'application/pdf' ? 'pdf' : 'webp'}"`,
    });
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
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
    @Param('solicitudId', new ParseUUIDPipe({ version: '4' })) request: string,
    @Body() dto: UploadProfilePhotoDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Selecciona una imagen o un PDF.');
    return this.evidence.upload(req.usuario, request, dto, file.buffer);
  }

  @Delete(':id')
  @Header('Cache-Control', 'private, no-store')
  remove(
    @Request() req: AuthenticatedRequest,
    @Param('solicitudId', new ParseUUIDPipe({ version: '4' })) request: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ProfilePhotoRevisionDto,
  ) {
    return this.evidence.remove(req.usuario, request, id, dto.revision);
  }
}
