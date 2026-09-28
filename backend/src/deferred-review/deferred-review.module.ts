import {
  Body,
  Controller,
  Get,
  Module,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { PrismaModule } from '../prisma/prisma.module';
import { DeferredReviewService } from './deferred-review.service';
import { ReviewEventDto } from './deferred-review.dto';

@Controller('repasos-diferidos/me')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class DeferredReviewController {
  constructor(private readonly service: DeferredReviewService) {}
  @Get() list(@Request() req: AuthenticatedRequest) {
    return this.service.list(req.usuario.sub);
  }
  @Post('eventos') record(
    @Request() req: AuthenticatedRequest,
    @Body() input: ReviewEventDto,
  ) {
    return this.service.record(req.usuario.sub, input);
  }
}
@Module({
  imports: [PrismaModule],
  controllers: [DeferredReviewController],
  providers: [DeferredReviewService],
})
export class DeferredReviewModule {}
