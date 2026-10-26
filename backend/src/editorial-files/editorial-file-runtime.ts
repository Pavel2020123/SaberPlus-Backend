import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class EditorialFileRuntime implements CanActivate {
  battleSnapshotsEnabled() {
    return (
      process.env.EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED === 'true' &&
      process.env.EDITORIAL_FILES_LOCAL_ENABLED === 'true' &&
      ['development', 'test'].includes(process.env.NODE_ENV ?? '')
    );
  }

  tugSnapshotsEnabled() {
    return (
      process.env.EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED === 'true' &&
      process.env.EDITORIAL_FILES_LOCAL_ENABLED === 'true' &&
      ['development', 'test'].includes(process.env.NODE_ENV ?? '')
    );
  }

  triviaSnapshotsEnabled() {
    return (
      process.env.EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED === 'true' &&
      process.env.EDITORIAL_FILES_LOCAL_ENABLED === 'true' &&
      ['development', 'test'].includes(process.env.NODE_ENV ?? '')
    );
  }

  snapshotsEnabled() {
    return (
      process.env.EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED === 'true' &&
      process.env.EDITORIAL_FILES_LOCAL_ENABLED === 'true' &&
      ['development', 'test'].includes(process.env.NODE_ENV ?? '')
    );
  }

  historyEnabled() {
    return (
      process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED === 'true' &&
      process.env.EDITORIAL_FILES_LOCAL_ENABLED === 'true' &&
      ['development', 'test'].includes(process.env.NODE_ENV ?? '')
    );
  }

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
