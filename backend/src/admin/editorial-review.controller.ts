import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { EstadoContenido } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsEnum,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AdminGuard } from '../auth/jwt.guard';
import {
  EditorialReviewService,
  REVIEW_KINDS,
  ReviewKind,
} from './editorial-review.service';

export class EditorialReviewParams {
  @IsIn(REVIEW_KINDS) tipo!: ReviewKind;
  @IsString() @MinLength(1) @MaxLength(120) id!: string;
}
export class EditorialStateDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) revision!: string;
  @IsEnum(EstadoContenido) destino!: EstadoContenido;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmado, {
    toClassOnly: true,
  })
  @Equals(true)
  confirmado!: boolean;
}
@Controller('admin/editor/revision')
@UseGuards(AdminGuard)
export class EditorialReviewController {
  constructor(private readonly review: EditorialReviewService) {}
  @Get(':tipo/:id') detalle(@Param() p: EditorialReviewParams) {
    return this.review.detalle(p.tipo, p.id);
  }
  @Patch(':tipo/:id') cambiar(
    @Param() p: EditorialReviewParams,
    @Body() body: EditorialStateDto,
  ) {
    return this.review.cambiar(p.tipo, p.id, body.revision, body.destino);
  }
}
