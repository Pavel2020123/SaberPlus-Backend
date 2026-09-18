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
import {
  CreateTeacherPriorityDto,
  TeacherPriorityCatalogDto,
  TeacherPriorityPageDto,
} from './teacher-priorities.dto';
import { TeacherPrioritiesService } from './teacher-priorities.service';
import { InstitutionOperationalGuard } from './institution-operational.guard';

@Controller('instituciones/me/grupos/:grupoId/prioridades')
@UseGuards(
  JwtGuard,
  EmailVerificadoGuard,
  InstitutionOperationalGuard,
  ProfesorInstitucionGuard,
)
export class TeacherPrioritiesController {
  constructor(private readonly service: TeacherPrioritiesService) {}

  @Get('catalogo')
  @Header('Cache-Control', 'private, no-store')
  catalog(
    @Request() req: AuthenticatedRequest,
    @Param('grupoId', new ParseUUIDPipe()) groupId: string,
    @Query() query: TeacherPriorityCatalogDto,
  ) {
    return this.service.catalog(req.usuario.sub, groupId, query);
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Request() req: AuthenticatedRequest,
    @Param('grupoId', new ParseUUIDPipe()) groupId: string,
    @Query() query: TeacherPriorityPageDto,
  ) {
    return this.service.listForTeacher(req.usuario.sub, groupId, query.pagina);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  create(
    @Request() req: AuthenticatedRequest,
    @Param('grupoId', new ParseUUIDPipe()) groupId: string,
    @Body() dto: CreateTeacherPriorityDto,
  ) {
    return this.service.create(req.usuario.sub, groupId, dto);
  }

  @Post(':prioridadId/retirar')
  @Header('Cache-Control', 'private, no-store')
  withdraw(
    @Request() req: AuthenticatedRequest,
    @Param('grupoId', new ParseUUIDPipe()) groupId: string,
    @Param('prioridadId', new ParseUUIDPipe()) priorityId: string,
  ) {
    return this.service.withdraw(req.usuario.sub, groupId, priorityId);
  }

  @Get(':prioridadId/cumplimiento')
  @Header('Cache-Control', 'private, no-store')
  report(
    @Request() req: AuthenticatedRequest,
    @Param('grupoId', new ParseUUIDPipe()) groupId: string,
    @Param('prioridadId', new ParseUUIDPipe()) priorityId: string,
    @Query() query: TeacherPriorityPageDto,
  ) {
    return this.service.report(
      req.usuario.sub,
      groupId,
      priorityId,
      query.pagina,
    );
  }
}

@Controller('prioridades-docentes')
@UseGuards(JwtGuard, EmailVerificadoGuard, InstitutionOperationalGuard)
export class StudentPrioritiesController {
  constructor(private readonly service: TeacherPrioritiesService) {}

  @Post(':prioridadId/practica')
  @Header('Cache-Control', 'private, no-store')
  practice(
    @Request() req: AuthenticatedRequest,
    @Param('prioridadId', new ParseUUIDPipe()) priorityId: string,
  ) {
    return this.service.startPractice(req.usuario.sub, priorityId);
  }

  @Get('me')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Request() req: AuthenticatedRequest,
    @Query() query: TeacherPriorityPageDto,
  ) {
    // La identidad siempre viene de la sesión, nunca de un estudianteId libre.
    return this.service.listForStudent(req.usuario.sub, query.pagina);
  }
}
