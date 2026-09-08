import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  Equals,
  IsDefined,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
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

export class ClozeDraftDto extends EditorRevisionDto {
  // Preserve number/boolean types inside the JSON; the shared validator checks every field.
  @IsDefined()
  datosInteractivo!: unknown;
}

export class ClozeRemovalDto extends EditorRevisionDto {
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmado, {
    toClassOnly: true,
  })
  @Equals(true)
  confirmado!: boolean;
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

  @Get('subtemas/:id/cloze')
  cloze(@Param('id') id: string) {
    return this.editor.detalleCloze(id);
  }

  @Patch('subtemas/:id/cloze')
  guardarCloze(@Param('id') id: string, @Body() dto: ClozeDraftDto) {
    return this.editor.guardarCloze(id, dto.revision, dto.datosInteractivo);
  }

  @Patch('subtemas/:id/cloze/retirar')
  quitarCloze(@Param('id') id: string, @Body() dto: ClozeRemovalDto) {
    return this.editor.quitarCloze(id, dto.revision, dto.confirmado);
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
