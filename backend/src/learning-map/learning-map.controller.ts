import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard, JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { MapSubtopicDto, ReplaceLearningBasesDto } from './learning-map.dto';
import { LearningMapService } from './learning-map.service';

@Controller('admin/mapa-aprendizaje/subtemas')
@UseGuards(AdminGuard)
export class AdminLearningMapController {
  constructor(private readonly maps: LearningMapService) {}
  @Get(':id')
  get(@Param() params: MapSubtopicDto) {
    return this.maps.read(params.id, true);
  }
  @Put(':id')
  replace(
    @Param() params: MapSubtopicDto,
    @Body() body: ReplaceLearningBasesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.maps.replace(params.id, body, req.usuario.sub);
  }
}

@Controller('mapa-aprendizaje/subtemas')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class LearningMapController {
  constructor(private readonly maps: LearningMapService) {}
  @Get(':id')
  get(@Param() params: MapSubtopicDto) {
    return this.maps.read(params.id, false);
  }
}
