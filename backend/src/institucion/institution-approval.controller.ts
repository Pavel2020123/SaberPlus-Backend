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
import { JwtGuard, AdminGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  ApprovalListDto,
  InstitutionMatchDto,
  ReviewInstitutionDto,
  SubmitInstitutionDto,
} from './institution-approval.dto';
import { InstitutionApprovalService } from './institution-approval.service';

@Controller('instituciones/registro')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class InstitutionRegistrationController {
  constructor(private readonly service: InstitutionApprovalService) {}
  @Get('me')
  @Header('Cache-Control', 'private, no-store')
  own(@Request() req: AuthenticatedRequest) {
    return this.service.own(req.usuario.sub);
  }
  @Get('coincidencias')
  @Header('Cache-Control', 'private, no-store')
  matches(
    @Request() req: AuthenticatedRequest,
    @Query() query: InstitutionMatchDto,
  ) {
    return this.service.matches(req.usuario.sub, query.nombre);
  }
  @Post()
  @Header('Cache-Control', 'private, no-store')
  submit(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SubmitInstitutionDto,
  ) {
    return this.service.submit(req.usuario.sub, dto);
  }
}

@Controller('admin/instituciones/solicitudes')
@UseGuards(AdminGuard)
export class InstitutionApprovalController {
  constructor(private readonly service: InstitutionApprovalService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Query() query: ApprovalListDto) {
    return this.service.list(query);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.detail(id);
  }
  @Post(':id/revision')
  @Header('Cache-Control', 'private, no-store')
  review(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewInstitutionDto,
  ) {
    return this.service.review(req.usuario.sub, id, dto);
  }
}
