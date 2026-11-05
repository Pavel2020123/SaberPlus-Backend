import { ServiceUnavailableException } from '@nestjs/common';
import { PrivateFileRuntime } from './private-file-runtime';

describe('private files local runtime', () => {
  const previous = {
    mode: process.env.NODE_ENV,
    enabled: process.env.PRIVATE_FILES_LOCAL_ENABLED,
    operations: process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED,
  };
  afterEach(() => {
    if (previous.mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.mode;
    if (previous.enabled === undefined)
      delete process.env.PRIVATE_FILES_LOCAL_ENABLED;
    else process.env.PRIVATE_FILES_LOCAL_ENABLED = previous.enabled;
    if (previous.operations === undefined)
      delete process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
    else
      process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = previous.operations;
  });
  it.each(['production', '', 'preview'])(
    'does not activate in %s by an isolated flag',
    (mode) => {
      process.env.NODE_ENV = mode;
      process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
      expect(() => new PrivateFileRuntime().canActivate()).toThrow(
        ServiceUnavailableException,
      );
    },
  );
  it.each(['false', '', 'TRUE'])('requires exact opt-in (%s)', (enabled) => {
    process.env.NODE_ENV = 'test';
    process.env.PRIVATE_FILES_LOCAL_ENABLED = enabled;
    expect(() => new PrivateFileRuntime().canActivate()).toThrow(
      ServiceUnavailableException,
    );
  });
  it.each(['test', 'development'])('allows explicit %s only', (mode) => {
    process.env.NODE_ENV = mode;
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
    expect(new PrivateFileRuntime().canActivate()).toBe(true);
  });
  it.each(['false', '', 'TRUE'])(
    'operator actions require their separate exact flag (%s)',
    (operations) => {
      process.env.NODE_ENV = 'test';
      process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
      process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = operations;
      expect(() => new PrivateFileRuntime().assertOperationsEnabled()).toThrow(
        ServiceUnavailableException,
      );
    },
  );
  it('operator flag cannot enable production or bypass the private runtime', () => {
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
    expect(() => new PrivateFileRuntime().assertOperationsEnabled()).toThrow();
    process.env.NODE_ENV = 'test';
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'false';
    expect(() => new PrivateFileRuntime().assertOperationsEnabled()).toThrow();
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
    expect(() =>
      new PrivateFileRuntime().assertOperationsEnabled(),
    ).not.toThrow();
  });
});
