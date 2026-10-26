import { databaseErrorCodes } from './competitive.database-error';

describe('database error diagnostic boundary', () => {
  it.each([null, undefined, 'offline', 3, new Error('offline')])(
    'accepts an unknown failure %p',
    (error) => {
      expect(databaseErrorCodes(error)).toEqual({});
    },
  );
  it('preserves Prisma and SQL codes separately', () => {
    expect(
      databaseErrorCodes({ code: 'P2010', meta: { code: '42P01' } }),
    ).toEqual({ code: 'P2010', sql: '42P01' });
  });
  it.each([null, 'invalid', { code: 42 }])(
    'does not trust malformed metadata %p',
    (meta) => {
      expect(databaseErrorCodes({ code: 42, meta })).toEqual({
        code: undefined,
        sql: undefined,
      });
    },
  );
});
