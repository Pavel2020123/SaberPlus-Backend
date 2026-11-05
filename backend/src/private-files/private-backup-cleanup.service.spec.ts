import { PrismaService } from '../prisma/prisma.service';
import { PrivateFileRuntime } from './private-file-runtime';
import { PrivateBackupCleanupService } from './private-backup-cleanup.service';

describe('private backup cleanup lifecycle (timer and database doubles)', () => {
  const previous = {
    mode: process.env.NODE_ENV,
    files: process.env.PRIVATE_FILES_LOCAL_ENABLED,
    operations: process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED,
  };
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'true';
  });
  afterEach(() => {
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.mode,
      PRIVATE_FILES_LOCAL_ENABLED: previous.files,
      PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED: previous.operations,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.useRealTimers();
  });
  const vault = {
    identity: () => Promise.resolve('11111111-1111-4111-8111-111111111111'),
    retire: () => Promise.resolve(),
  };

  it('does not start a timer or storage operation without the operator opt-in', async () => {
    jest.useFakeTimers();
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'false';
    const service = new PrivateBackupCleanupService(
      {} as PrismaService,
      vault,
      new PrivateFileRuntime(),
    );
    const run = jest.spyOn(service, 'runOnce');
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(120000);
    expect(run).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    await service.onModuleDestroy();
  });
  it('runs at startup and each minute, and stops after module shutdown', async () => {
    jest.useFakeTimers();
    const service = new PrivateBackupCleanupService(
      {} as PrismaService,
      vault,
      new PrivateFileRuntime(),
    );
    const run = jest
      .spyOn(service, 'runOnce')
      .mockResolvedValue({ removed: 0, pending: 0 });
    service.onModuleInit();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(120000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('module shutdown waits for an already running sweep', async () => {
    let finish!: () => void;
    const deferred = new Promise<[]>((resolve) => {
      finish = () => resolve([]);
    });
    const prisma = {
      $queryRaw: jest.fn(() => deferred),
    } as unknown as PrismaService;
    const service = new PrivateBackupCleanupService(
      prisma,
      vault,
      new PrivateFileRuntime(),
    );
    const work = service.runOnce();
    let closed = false;
    const closing = service.onModuleDestroy().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    finish();
    await Promise.all([work, closing]);
    expect(closed).toBe(true);
  });
});
