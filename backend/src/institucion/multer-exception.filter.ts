import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';

@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(excepcion: MulterError, host: ArgumentsHost) {
    const contexto = host.switchToHttp();
    const respuesta = contexto.getResponse<Response>();

    const mensaje =
      excepcion.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el tamaño máximo permitido.'
        : 'No se pudo procesar el archivo subido.';

    respuesta.status(400).json({ statusCode: 400, message: mensaje });
  }
}
