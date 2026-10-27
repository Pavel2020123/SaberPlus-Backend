import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEditorialFilesDatabase } from './test_editorial_files_postgres.mjs';

const nonce = '0123456789abcdef';
const url = `postgresql://sp_test_${nonce}:fixture@127.0.0.1:54321/postgres?connection_limit=12&pool_timeout=30`;
const marker = { purpose: 'saberplus-c5-disposable-v1', nonce, url };
test('C5 acepta solo el identificador y la conexión temporal propios', () => {
  assert.doesNotThrow(() => validateEditorialFilesDatabase(url, marker));
});
for (const value of [
  url.replace('127.0.0.1', 'supabase.example'),
  url.replace('127.0.0.1', 'localhost'),
  url.replace('postgresql:', 'https:'),
  url.replace(':54321', ':5432').replace('/postgres?', '/production?'),
  url + '&schema=public',
  url + '#fragment',
])
  test(
    'C5 rechaza otra dirección, base o parámetro: ' + new URL(value).hostname,
    () => {
      assert.throws(() =>
        validateEditorialFilesDatabase(value, { ...marker, url: value }),
      );
    },
  );
test('C5 rechaza marcadores de otros ejecutores y nonces distintos', () => {
  assert.throws(() =>
    validateEditorialFilesDatabase(url, { ...marker, purpose: 'otro' }),
  );
  assert.throws(() =>
    validateEditorialFilesDatabase(url, {
      ...marker,
      nonce: 'fedcba9876543210',
    }),
  );
  assert.throws(() =>
    validateEditorialFilesDatabase(url, { ...marker, url: url + 'x' }),
  );
});
