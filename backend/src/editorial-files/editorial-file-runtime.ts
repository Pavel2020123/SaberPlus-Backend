import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class EditorialFileRuntime implements CanActivate {
  assertEnabled() {
    if (
      process.env.EDITORIAL_FILES_LOCAL_ENABLED !== 'true' ||
      !['development', 'test'].includes(process.env.NODE_ENV ?? '')
    )
      throw new ServiceUnavailableException(
        'La carga local de archivos editoriales todavía no está habilitada.',
      );
  }

  canActivate() {
    // Se ejecuta antes del interceptor multipart, no después de recibir bytes.
    this.assertEnabled();
    return true;
  }
}
