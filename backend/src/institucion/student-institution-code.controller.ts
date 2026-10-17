import {
  Body,
  Controller,
  Get,
  Header,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  JoinStudentInstitutionCodeDto,
  PreviewStudentInstitutionCodeDto,
  RotateStudentInstitutionCodeDto,
} from './student-institution-code.dto';
import { StudentInstitutionCodeService } from './student-institution-code.service';

@Controller('instituciones/codigo-estudiantes')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class StudentInstitutionCodeController {
  constructor(private readonly service: StudentInstitutionCodeService) {}

  @Get('propio')
  @Header('Cache-Control', 'private, no-store')
  own(@Request() req: AuthenticatedRequest) {
    return this.service.own(req.usuario.sub);
  }

  @Post('renovar')
  @Header('Cache-Control', 'private, no-store')
  rotate(
    @Request() req: AuthenticatedRequest,
    @Body() dto: RotateStudentInstitutionCodeDto,
  ) {
    return this.service.rotate(req.usuario.sub, dto);
  }

  // POST: el código secreto no debe viajar en URLs, historiales ni query strings.
  @Post('consultar')
  @Header('Cache-Control', 'private, no-store')
  preview(
    @Request() req: AuthenticatedRequest,
    @Body() dto: PreviewStudentInstitutionCodeDto,
  ) {
    return this.service.preview(req.usuario.sub, dto);
  }

  @Post('ingresar')
  @Header('Cache-Control', 'private, no-store')
  join(
    @Request() req: AuthenticatedRequest,
    @Body() dto: JoinStudentInstitutionCodeDto,
  ) {
    return this.service.join(req.usuario.sub, dto);
  }
}
