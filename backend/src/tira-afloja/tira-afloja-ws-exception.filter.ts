import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Socket } from 'socket.io';

@Catch()
export class TiraAflojaWsExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const cliente = host.switchToWs().getClient<Socket>();
    if (exception instanceof HttpException) {
      const respuesta = exception.getResponse();
      const mensaje =
        typeof respuesta === 'string'
          ? respuesta
          : (this.leerMensaje(respuesta) ?? exception.message);
      cliente.emit('tira:error', {
        codigo: `HTTP_${exception.getStatus()}`,
        mensaje,
      });
      return;
    }
    cliente.emit('tira:error', {
      codigo: 'ERROR_INTERNO',
      mensaje: 'No fue posible procesar la accion del juego.',
    });
  }

  private leerMensaje(respuesta: object): string | undefined {
    if (!('message' in respuesta)) return undefined;
    const mensaje = respuesta.message;
    if (typeof mensaje === 'string') return mensaje;
    return Array.isArray(mensaje) ? mensaje.join(', ') : undefined;
  }
}
