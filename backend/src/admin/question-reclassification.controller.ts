import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/jwt.guard';
import {
  ApplyReclassificationDto,
  ReclassificationDestinationDto,
  ReclassificationParams,
} from './question-reclassification.dto';
import { QuestionReclassificationService } from './question-reclassification.service';

@Controller('admin/editor/reclasificacion/preguntas')
@UseGuards(AdminGuard)
export class QuestionReclassificationController {
  constructor(private readonly service: QuestionReclassificationService) {}
  @Get(':id') preview(
    @Param() p: ReclassificationParams,
    @Query() q: ReclassificationDestinationDto,
  ) {
    return this.service.preview(p.id, q.destinoSubtemaId);
  }
  @Patch(':id') apply(
    @Param() p: ReclassificationParams,
    @Body() body: ApplyReclassificationDto,
  ) {
    return this.service.apply(p.id, body);
  }
}
