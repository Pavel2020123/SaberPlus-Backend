import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class PrivateFileRuntime implements CanActivate {
  assertEnabled() {
    if (
      process.env.PRIVATE_FILES_LOCAL_ENABLED !== 'true' ||
      !['development', 'test'].includes(process.env.NODE_ENV ?? '')
    )
      throw new ServiceUnavailableException(
        'Los archivos privados no están habilitados.',
      );
  }
  canActivate() {
    // Runs before multipart buffers are allocated; selecting a provider enables nothing.
    this.assertEnabled();
    return true;
  }
  assertOperationsEnabled() {
    this.assertEnabled();
    if (process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'Las operaciones privadas locales no están habilitadas.',
      );
  }
}
