import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AreaIcfes } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { AdminGuard } from '../auth/jwt.guard';
import { AcademicCatalogService } from './academic-catalog.service';
import { LessonEditorService } from './lesson-editor.service';
import { QuestionEditorService } from './question-editor.service';
import {
  EditorNameDto,
  EditorRemovalDto,
  LessonDraftDto,
} from './lesson-editor.controller';
import {
  EditorialCaseDto,
  EditorialCasesQuery,
  EditorialQuestionDto,
  EditorialQuestionsQuery,
} from './question-editor.dto';

class ThemeDto {
  @IsString() @MinLength(1) @MaxLength(120) nombre!: string;
  @IsEnum(AreaIcfes) area!: AreaIcfes;
}
class SubthemeDto {
  @IsString() @MinLength(1) @MaxLength(120) nombre!: string;
  @IsString() @MinLength(1) @MaxLength(120) temaId!: string;
}

/** Separate contract: successful saves are published; legacy draft APIs stay compatible. */
@Controller('admin/simple')
@UseGuards(AdminGuard)
export class SimpleContentController {
  constructor(
    private readonly catalog: AcademicCatalogService,
    private readonly lessons: LessonEditorService,
    private readonly questions: QuestionEditorService,
  ) {}

  @Post('temas') theme(@Body() body: ThemeDto) {
    return this.catalog.crearTema(body.nombre, body.area, true);
  }
  @Post('subtemas') subtheme(@Body() body: SubthemeDto) {
    return this.catalog.crearSubtema(body.nombre, body.temaId, true);
  }
  @Get('editor/temas/:id') themeDetail(@Param('id') id: string) {
    return this.lessons.detalle('temas', id, true);
  }
  @Get('editor/subtemas/:id') subDetail(@Param('id') id: string) {
    return this.lessons.detalle('subtemas', id, true);
  }
  @Patch('editor/temas/:id/nombre') themeName(
    @Param('id') id: string,
    @Body() b: EditorNameDto,
  ) {
    return this.lessons.renombrar('temas', id, b.revision, b.nombre, true);
  }
  @Patch('editor/subtemas/:id/nombre') subName(
    @Param('id') id: string,
    @Body() b: EditorNameDto,
  ) {
    return this.lessons.renombrar('subtemas', id, b.revision, b.nombre, true);
  }
  @Patch('editor/subtemas/:id/leccion') lesson(
    @Param('id') id: string,
    @Body() b: LessonDraftDto,
  ) {
    return this.lessons.guardar(
      id,
      b.revision,
      b.contenido,
      b.videoUrl,
      b.imagenUrl,
      true,
    );
  }
  @Delete('editor/temas/:id') deleteTheme(
    @Param('id') id: string,
    @Body() b: EditorRemovalDto,
  ) {
    return this.lessons.eliminar('temas', id, b.revision, b.confirmado, true);
  }
  @Delete('editor/subtemas/:id') deleteSub(
    @Param('id') id: string,
    @Body() b: EditorRemovalDto,
  ) {
    return this.lessons.eliminar(
      'subtemas',
      id,
      b.revision,
      b.confirmado,
      true,
    );
  }
  @Get('editor/preguntas') list(@Query() q: EditorialQuestionsQuery) {
    return this.questions.preguntas(q.subtemaId, q.pagina, q.limite, true);
  }
  @Get('editor/preguntas/:id') detail(@Param('id') id: string) {
    return this.questions.detallePregunta(id, true);
  }
  @Post('editor/preguntas') create(@Body() b: EditorialQuestionDto) {
    return this.questions.guardarPregunta(b, undefined, true);
  }
  @Patch('editor/preguntas/:id') update(
    @Param('id') id: string,
    @Body() b: EditorialQuestionDto,
  ) {
    return this.questions.guardarPregunta(b, id, true);
  }
  @Get('editor/casos') cases(@Query() q: EditorialCasesQuery) {
    return this.questions.casos(q.area, q.pagina, q.limite);
  }
  @Get('editor/casos/:id') caseDetail(@Param('id') id: string) {
    return this.questions.detalleCaso(id, true);
  }
  @Post('editor/casos') createCase(@Body() b: EditorialCaseDto) {
    return this.questions.guardarCaso(b, undefined, true);
  }
  @Patch('editor/casos/:id') updateCase(
    @Param('id') id: string,
    @Body() b: EditorialCaseDto,
  ) {
    return this.questions.guardarCaso(b, id, true);
  }
}
