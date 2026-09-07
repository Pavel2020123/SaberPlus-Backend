import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/jwt.guard';
import { QuestionEditorService } from './question-editor.service';
import {
  EditorialCaseDto,
  EditorialCasesQuery,
  EditorialQuestionDto,
  EditorialQuestionsQuery,
} from './question-editor.dto';

@Controller('admin/editor')
@UseGuards(AdminGuard)
export class QuestionEditorController {
  constructor(private readonly editor: QuestionEditorService) {}
  @Get('preguntas') preguntas(@Query() q: EditorialQuestionsQuery) {
    return this.editor.preguntas(q.subtemaId, q.pagina, q.limite);
  }
  @Get('preguntas/:id') pregunta(@Param('id') id: string) {
    return this.editor.detallePregunta(id);
  }
  @Post('preguntas') crearPregunta(@Body() body: EditorialQuestionDto) {
    return this.editor.guardarPregunta(body);
  }
  @Patch('preguntas/:id') editarPregunta(
    @Param('id') id: string,
    @Body() body: EditorialQuestionDto,
  ) {
    return this.editor.guardarPregunta(body, id);
  }
  @Get('casos') casos(@Query() q: EditorialCasesQuery) {
    return this.editor.casos(q.area, q.pagina, q.limite);
  }
  @Get('casos/:id') caso(@Param('id') id: string) {
    return this.editor.detalleCaso(id);
  }
  @Post('casos') crearCaso(@Body() body: EditorialCaseDto) {
    return this.editor.guardarCaso(body);
  }
  @Patch('casos/:id') editarCaso(
    @Param('id') id: string,
    @Body() body: EditorialCaseDto,
  ) {
    return this.editor.guardarCaso(body, id);
  }
}
