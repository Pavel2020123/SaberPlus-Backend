import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnedConnection } from './test_editorial_postgres.mjs';

const valid =
  'postgresql://sp_test_0123456789abcdef:password-for-test@127.0.0.1:54329/postgres?connection_limit=6&pool_timeout=5';
const marker = (url) => ({ purpose: 'saberplus-editorial-disposable-v1', url });
test('el ejecutor acepta únicamente el destino loopback marcado como desechable', () => {
  assert.equal(
    validateOwnedConnection(valid, marker(valid)).hostname,
    '127.0.0.1',
  );
});
for (const [label, url] of [
  ['host remoto', valid.replace('127.0.0.1', 'db.example.com')],
  ['localhost ambiguo', valid.replace('127.0.0.1', 'localhost')],
  ['usuario habitual', valid.replace('sp_test_0123456789abcdef', 'postgres')],
  ['base de trabajo', valid.replace('/postgres?', '/saberplus?')],
  ['puerto de sistema', valid.replace('54329', '80')],
  ['contraseña ausente', valid.replace(':password-for-test', '')],
  ['protocolo ajeno', valid.replace('postgresql:', 'https:')],
  ['opción de host oculta', `${valid}&host=example.com`],
  ['fragmento inesperado', `${valid}#otra-base`],
])
  test(`rechaza ${label} incluso con marcador coincidente`, () => {
    assert.throws(() => validateOwnedConnection(url, marker(url)));
  });
test('rechaza marcador distinto o sin propósito explícito', () => {
  assert.throws(() =>
    validateOwnedConnection(valid, marker(valid.replace('54329', '54330'))),
  );
  assert.throws(() => validateOwnedConnection(valid, { url: valid }));
});
