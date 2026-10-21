import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientInitializationError,
  PayloadTooLargeException,
)
export class EditorialFileStorageFilter implements ExceptionFilter {
  catch(_error: unknown, host: ArgumentsHost) {
    if (_error instanceof PayloadTooLargeException) {
      host.switchToHttp().getResponse<Response>().status(413).json({
        statusCode: 413,
        message: 'La imagen supera el tamaño máximo de 5 MiB.',
      });
      return;
    }
    host.switchToHttp().getResponse<Response>().status(503).json({
      statusCode: 503,
      message:
        'No se pudo confirmar la operación. Consulta su estado antes de reenviar el archivo.',
    });
  }
}
