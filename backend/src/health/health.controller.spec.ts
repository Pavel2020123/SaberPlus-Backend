import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const query = jest.fn();
  const controller = new HealthController({
    $queryRaw: query,
  } as unknown as PrismaService);

  beforeEach(() => query.mockReset());

  it('reports process liveness without querying the database', () => {
    expect(controller.live()).toEqual({
      status: 'OK',
      service: 'saberplus-api',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL responds', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.ready()).resolves.toEqual({
      status: 'OK',
      service: 'saberplus-api',
      database: 'UP',
    });
  });

  it('does not expose database errors when readiness fails', async () => {
    query.mockRejectedValue(new Error('secret database detail'));

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
