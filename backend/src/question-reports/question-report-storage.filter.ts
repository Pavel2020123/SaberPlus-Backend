import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Prisma diagnostics can contain invocation values; never serialize/log them here. */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
)
export class QuestionReportStorageFilter implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    response.status(503).json({
      statusCode: 503,
      code: 'REPORT_STORAGE_UNAVAILABLE',
      message:
        'No pudimos confirmar la operación. Si enviaste un reporte, consulta el recibo antes de reenviar el mismo intento.',
    });
  }
}
