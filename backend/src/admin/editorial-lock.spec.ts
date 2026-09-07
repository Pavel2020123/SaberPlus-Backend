import { BadRequestException } from '@nestjs/common';
import { AreaIcfes, Prisma } from '@prisma/client';
import { lockEditorialArea } from './editorial-lock';

describe('shared editorial transaction lock', () => {
  it.each(Object.values(AreaIcfes))(
    'uses the same parameterized namespace for %s',
    async (area) => {
      const query = jest
        .fn<Promise<unknown[]>, [TemplateStringsArray, ...unknown[]]>()
        .mockResolvedValue([]);
      await lockEditorialArea(
        { $queryRaw: query } as unknown as Prisma.TransactionClient,
        area,
      );
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][1]).toBe(`editor:area:${area}`);
    },
  );
  it('rejects an unknown area without a database query', async () => {
    const query = jest.fn();
    await expect(
      lockEditorialArea(
        { $queryRaw: query } as unknown as Prisma.TransactionClient,
        'INVALID' as AreaIcfes,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
