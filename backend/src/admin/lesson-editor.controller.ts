import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AdminGuard } from '../auth/jwt.guard';
import { LessonEditorService } from './lesson-editor.service';

export class EditorRevisionDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  revision!: string;
}
export class LessonDraftDto extends EditorRevisionDto {
  @IsString()
  @MaxLength(30000)
  contenido!: string;

  @IsString()
  @MaxLength(2000)
  videoUrl!: string;

  @IsString()
  @MaxLength(2000)
  imagenUrl!: string;
}
export class EditorNameDto extends EditorRevisionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;
}

@Controller('admin/editor')
@UseGuards(AdminGuard)
export class LessonEditorController {
  constructor(private readonly editor: LessonEditorService) {}

  @Get('temas/:id')
  tema(@Param('id') id: string) {
    return this.editor.detalle('temas', id);
  }

  @Get('subtemas/:id')
  subtema(@Param('id') id: string) {
    return this.editor.detalle('subtemas', id);
  }

  @Patch('subtemas/:id/leccion')
  guardar(@Param('id') id: string, @Body() dto: LessonDraftDto) {
    return this.editor.guardar(
      id,
      dto.revision,
      dto.contenido,
      dto.videoUrl,
      dto.imagenUrl,
    );
  }

  @Patch('temas/:id/nombre')
  nombreTema(@Param('id') id: string, @Body() dto: EditorNameDto) {
    return this.editor.renombrar('temas', id, dto.revision, dto.nombre);
  }

  @Patch('subtemas/:id/nombre')
  nombreSubtema(@Param('id') id: string, @Body() dto: EditorNameDto) {
    return this.editor.renombrar('subtemas', id, dto.revision, dto.nombre);
  }
}
