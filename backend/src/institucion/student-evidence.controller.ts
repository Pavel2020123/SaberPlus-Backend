import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard, ProfesorInstitucionGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { StudentEvidenceService } from './student-evidence.service';

@Controller('instituciones')
@UseGuards(JwtGuard, EmailVerificadoGuard, ProfesorInstitucionGuard)
export class StudentEvidenceController {
  constructor(private readonly service: StudentEvidenceService) {}

  @Get('me/estudiantes/:estudianteId/evidencia')
  @Header('Cache-Control', 'private, no-store')
  obtener(
    @Request() req: AuthenticatedRequest,
    @Param('estudianteId', new ParseUUIDPipe()) estudianteId: string,
  ) {
    return this.service.obtener(req.usuario.sub, estudianteId);
  }
}
