import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/jwt.guard';
import { LegacyQuestionIndexService } from './legacy-question-index.service';
import {
  ApplyLegacyIndexDto,
  LegacyDuplicatesDto,
  LegacyFingerprintParams,
  LegacyIndexBatchDto,
  LegacyMatchesDto,
} from './legacy-question-index.dto';

@Controller('admin/editor/legado/indice')
@UseGuards(AdminGuard)
export class LegacyQuestionIndexController {
  constructor(private readonly index: LegacyQuestionIndexService) {}
  @Get('lote') preview(@Query() q: LegacyIndexBatchDto) {
    return this.index.preview(q);
  }
  @Post('lote') apply(@Body() q: ApplyLegacyIndexDto) {
    return this.index.apply(q);
  }
  @Get('duplicados') duplicates(@Query() q: LegacyDuplicatesDto) {
    return this.index.duplicates(q);
  }
  @Get('coincidencias/:huella') matches(
    @Param() p: LegacyFingerprintParams,
    @Query() q: LegacyMatchesDto,
  ) {
    return this.index.matches(p.huella, q);
  }
}
