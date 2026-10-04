import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';
import { checkCompetitiveReadiness } from './competitive.readiness';
jest.mock('./competitive.readiness', () => ({
  checkCompetitiveReadiness: jest.fn(),
}));
const probe = checkCompetitiveReadiness as jest.Mock;
describe('HealthController', () => {
  let controller: HealthController;
  beforeEach(() => {
    jest.useFakeTimers();
    probe.mockReset();
    controller = new HealthController({} as PrismaService);
  });
  afterEach(() => jest.useRealTimers());
  it('liveness stays healthy without querying PostgreSQL', () => {
    expect(controller.live()).toEqual({
      status: 'OK',
      service: 'saberplus-api',
    });
    expect(probe).not.toHaveBeenCalled();
  });
  it('preserves the success contract, coalesces parallel probes and caches for only five seconds', async () => {
    probe.mockResolvedValue(undefined);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => controller.ready()),
    );
    expect(results.every((r) => r.database === 'UP')).toBe(true);
    expect(results[0]).toEqual({
      status: 'OK',
      service: 'saberplus-api',
      database: 'UP',
    });
    expect(probe).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(4999);
    await controller.ready();
    expect(probe).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await controller.ready();
    expect(probe).toHaveBeenCalledTimes(2);
  });
  it.each([
    'connection secret',
    'missing schema',
    'permissions secret',
    'timeout',
  ])('fails safely and recovers after %s', async (reason) => {
    probe.mockRejectedValueOnce(new Error(reason)).mockResolvedValue(undefined);
    const failure = await controller.ready().catch((e) => e);
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(failure.getResponse()).toEqual({
      status: 'ERROR',
      service: 'saberplus-api',
      database: 'DOWN',
    });
    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(probe).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000);
    await expect(controller.ready()).resolves.toHaveProperty('database', 'UP');
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
