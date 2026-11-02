import {
  Body,
  Controller,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsString, Matches } from 'class-validator';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { PlanVigenteGuard } from '../auth/plan-vigente.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PrivateOfflineLessonService } from './private-offline-lesson.service';

class ValidatePrivateLessonDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  requestNonce!: string;
}

@Controller('recursos/editoriales/lecciones')
@UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
export class PrivateOfflineLessonController {
  constructor(private readonly lessons: PrivateOfflineLessonService) {}

  @Post(':id/offline')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  validate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ValidatePrivateLessonDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.lessons.validate(req.usuario.sub, id, dto.requestNonce);
  }
}
