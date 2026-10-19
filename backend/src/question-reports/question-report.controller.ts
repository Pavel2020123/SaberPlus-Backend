import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { AdminGuard, JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  AdminQuestionReportQuery,
  CreateQuestionReportDto,
  QuestionReportPageDto,
  ReviewQuestionReportDto,
} from './question-report.dto';
import { QuestionReportService } from './question-report.service';
import { QuestionReportStorageFilter } from './question-report-storage.filter';

@Controller('preguntas/reportes')
@UseGuards(JwtGuard, EmailVerificadoGuard)
@UseFilters(QuestionReportStorageFilter)
export class QuestionReportController {
  constructor(private readonly reports: QuestionReportService) {}
  @Post()
  @Header('Cache-Control', 'private, no-store')
  create(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateQuestionReportDto,
  ) {
    return this.reports.create(req.usuario.sub, body);
  }
  @Get('operaciones/:operacionId')
  @Header('Cache-Control', 'private, no-store')
  receipt(
    @Request() req: AuthenticatedRequest,
    @Param('operacionId', new ParseUUIDPipe({ version: '4' }))
    operationId: string,
  ) {
    return this.reports.ownReceipt(req.usuario.sub, operationId);
  }
  @Get('mios')
  @Header('Cache-Control', 'private, no-store')
  own(
    @Request() req: AuthenticatedRequest,
    @Query() query: QuestionReportPageDto,
  ) {
    return this.reports.own(req.usuario.sub, query);
  }
}

@Controller('admin/reportes-preguntas')
@UseGuards(AdminGuard)
@UseFilters(QuestionReportStorageFilter)
export class AdminQuestionReportController {
  constructor(private readonly reports: QuestionReportService) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Request() req: AuthenticatedRequest,
    @Query() query: AdminQuestionReportQuery,
  ) {
    return this.reports.list(req.usuario.sub, query);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detail(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.reports.detail(req.usuario.sub, id);
  }
  @Patch(':id/estado')
  @Header('Cache-Control', 'private, no-store')
  review(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: ReviewQuestionReportDto,
  ) {
    return this.reports.review(req.usuario.sub, id, body);
  }
}
