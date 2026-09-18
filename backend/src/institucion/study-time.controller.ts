import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard, ProfesorInstitucionGuard } from '../auth/jwt.guard';
import { StudyTimeQueryDto, SyncPomodorosDto } from './study-time.dto';
import { StudyTimeService } from './study-time.service';
import { InstitutionOperationalGuard } from './institution-operational.guard';

@Controller('tiempo-estudio/me')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class StudyTimeController {
  constructor(private readonly service: StudyTimeService) {}

  @Post('pomodoros')
  @Header('Cache-Control', 'private, no-store')
  synchronize(
    @Request() req: AuthenticatedRequest,
    @Body() body: SyncPomodorosDto,
  ) {
    return this.service.synchronize(req.usuario.sub, body);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  summary(
    @Request() req: AuthenticatedRequest,
    @Query() query: StudyTimeQueryDto,
  ) {
    return this.service.ownSummary(req.usuario.sub, query.dias);
  }
}

@Controller('instituciones/me/estudiantes')
@UseGuards(
  JwtGuard,
  EmailVerificadoGuard,
  InstitutionOperationalGuard,
  ProfesorInstitucionGuard,
)
export class TeacherStudyTimeController {
  constructor(private readonly service: StudyTimeService) {}

  @Get(':estudianteId/evolucion')
  @Header('Cache-Control', 'private, no-store')
  summary(
    @Request() req: AuthenticatedRequest,
    @Param('estudianteId', new ParseUUIDPipe()) studentId: string,
    @Query() query: StudyTimeQueryDto,
  ) {
    return this.service.teacherSummary(req.usuario.sub, studentId, query.dias);
  }
}
