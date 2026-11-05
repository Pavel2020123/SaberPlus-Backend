import { createHash, randomBytes } from 'node:crypto';
import {
  openPrivateBackup,
  sealPrivateBackup,
  PrivateBackupIdentity,
} from './private-backup-envelope';
import { PRIVATE_BYTES_LIMIT } from './private-local-file.store';

describe('private encrypted backup envelope (memory only)', () => {
  const bytes = Buffer.from('%PDF-1.7\nsynthetic private content\n%%EOF');
  const key = randomBytes(32);
  const expected: PrivateBackupIdentity = {
    id: '2df4f385-fec2-4cb1-89af-91f67a476b52',
    mime: 'application/pdf',
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  it('restores exact bytes with separate key and fresh nonces, without plaintext', () => {
    const first = sealPrivateBackup(expected, bytes, key);
    const second = sealPrivateBackup(expected, bytes, key);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.ciphertext).not.toBe(bytes.toString('base64'));
    expect(openPrivateBackup(first, expected, key).equals(bytes)).toBe(true);
    expect(Object.isFrozen(first.identity)).toBe(true);
  });
  it('rejects wrong key and authenticated metadata replacement', () => {
    const backup = sealPrivateBackup(expected, bytes, key);
    expect(() => openPrivateBackup(backup, expected, randomBytes(32))).toThrow(
      'Respaldo privado no válido.',
    );
    const other = { ...expected, id: '3df4f385-fec2-4cb1-89af-91f67a476b52' };
    expect(() => openPrivateBackup(backup, other, key)).toThrow();
    expect(() =>
      openPrivateBackup({ ...backup, identity: other }, other, key),
    ).toThrow();
  });
  it.each(['nonce', 'tag', 'ciphertext'] as const)(
    'rejects tampered %s without exposing bytes',
    (field) => {
      const backup = sealPrivateBackup(expected, bytes, key);
      const corrupt = Buffer.from(backup[field], 'base64');
      corrupt[0] ^= 1;
      expect(() =>
        openPrivateBackup(
          { ...backup, [field]: corrupt.toString('base64') },
          expected,
          key,
        ),
      ).toThrow('Respaldo privado no válido.');
    },
  );
  it('requires canonical bounded data, exact schema and matching digest', () => {
    const backup = sealPrivateBackup(expected, bytes, key);
    for (const altered of [
      null,
      { ...backup, version: 2 },
      { ...backup, key },
      { ...backup, ciphertext: backup.ciphertext + '=' },
      { ...backup, identity: { ...expected, owner: 'not allowed' } },
    ]) {
      expect(() => openPrivateBackup(altered, expected, key)).toThrow();
    }
    expect(() =>
      sealPrivateBackup(
        { ...expected, bytes: PRIVATE_BYTES_LIMIT + 1 },
        bytes,
        key,
      ),
    ).toThrow();
    expect(() =>
      sealPrivateBackup({ ...expected, sha256: '0'.repeat(64) }, bytes, key),
    ).toThrow();
    expect(() => sealPrivateBackup(expected, bytes, Buffer.alloc(0))).toThrow();
  });
  it('supports the exact 5 MiB bound without altering bytes', () => {
    const maximum = Buffer.alloc(PRIVATE_BYTES_LIMIT, 35);
    const meta = {
      ...expected,
      bytes: maximum.length,
      sha256: createHash('sha256').update(maximum).digest('hex'),
    };
    expect(
      openPrivateBackup(
        sealPrivateBackup(meta, maximum, key),
        meta,
        key,
      ).equals(maximum),
    ).toBe(true);
  });
});
