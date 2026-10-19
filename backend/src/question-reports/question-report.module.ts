import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import rateLimit from 'express-rate-limit';
import { PrismaModule } from '../prisma/prisma.module';
import {
  AdminQuestionReportController,
  QuestionReportController,
} from './question-report.controller';
import { QuestionReportService } from './question-report.service';
import { QuestionReportStorageFilter } from './question-report-storage.filter';

/** Additional per-process/IP envelope; durable account limits live in PostgreSQL. */
export const reportIpOptions = {
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: { method: string }) => !['POST', 'PATCH'].includes(req.method),
  message: {
    statusCode: 429,
    code: 'REPORT_IP_RATE_LIMIT',
    retryAfterSeconds: 60,
    message:
      'Demasiadas solicitudes. Espera un minuto antes de intentar de nuevo.',
  },
};

@Module({
  imports: [PrismaModule],
  controllers: [QuestionReportController, AdminQuestionReportController],
  providers: [QuestionReportService, QuestionReportStorageFilter],
})
export class QuestionReportModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(rateLimit(reportIpOptions))
      .forRoutes(QuestionReportController, AdminQuestionReportController);
  }
}
