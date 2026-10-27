import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  CreateStudentInstitutionRequestDto,
  OwnerStudentInstitutionRequestsQuery,
  ReviewStudentInstitutionRequestDto,
  StudentInstitutionRequestRevisionDto,
  StudentInstitutionRequestsQuery,
} from './student-institution-request.dto';
import { StudentInstitutionRequestService } from './student-institution-request.service';

@Controller('instituciones/ingresos-estudiantes')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class StudentInstitutionRequestController {
  constructor(private readonly service: StudentInstitutionRequestService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateStudentInstitutionRequestDto,
  ) {
    return this.service.create(req.usuario.sub, dto);
  }

  @Get('me')
  @Header('Cache-Control', 'private, no-store')
  own(
    @Request() req: AuthenticatedRequest,
    @Query() query: StudentInstitutionRequestsQuery,
  ) {
    return this.service.own(req.usuario.sub, query);
  }

  @Delete(':id')
  @Header('Cache-Control', 'private, no-store')
  cancel(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: StudentInstitutionRequestRevisionDto,
  ) {
    return this.service.cancel(req.usuario.sub, id, dto.revision);
  }

  @Get('pendientes')
  @Header('Cache-Control', 'private, no-store')
  inbox(
    @Request() req: AuthenticatedRequest,
    @Query() query: OwnerStudentInstitutionRequestsQuery,
  ) {
    return this.service.inbox(req.usuario.sub, query);
  }

  @Patch(':id/revision')
  @Header('Cache-Control', 'private, no-store')
  review(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReviewStudentInstitutionRequestDto,
  ) {
    return this.service.review(req.usuario.sub, id, dto);
  }
}
