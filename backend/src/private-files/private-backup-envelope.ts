import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { PRIVATE_BYTES_LIMIT } from './private-local-file.store';

export type PrivateBackupIdentity = Readonly<{
  id: string;
  sha256: string;
  bytes: number;
  mime: 'application/pdf' | 'image/webp';
}>;
export type PrivateBackupEnvelope = Readonly<{
  version: 1;
  identity: PrivateBackupIdentity;
  nonce: string;
  tag: string;
  ciphertext: string;
}>;

const invalid = () => new Error('Respaldo privado no válido.');
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
function identity(value: unknown): PrivateBackupIdentity {
  if (
    !object(value) ||
    Object.keys(value).length !== 4 ||
    !['id', 'sha256', 'bytes', 'mime'].every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    ) ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value.id,
    ) ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !Number.isInteger(value.bytes) ||
    Number(value.bytes) < 1 ||
    Number(value.bytes) > PRIVATE_BYTES_LIMIT ||
    typeof value.mime !== 'string' ||
    !['application/pdf', 'image/webp'].includes(value.mime)
  )
    throw invalid();
  return {
    id: value.id,
    sha256: value.sha256,
    bytes: Number(value.bytes),
    mime: value.mime as PrivateBackupIdentity['mime'],
  };
}
function aad(value: PrivateBackupIdentity): Buffer {
  return Buffer.from(
    JSON.stringify([
      'saberplus-private-backup',
      1,
      value.id,
      value.sha256,
      value.bytes,
      value.mime,
    ]),
  );
}
function keyCheck(key: Buffer) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw invalid();
}
function decode(value: unknown, bytes: number): Buffer {
  // Check encoded size before decoding an untrusted backup into memory.
  if (
    typeof value !== 'string' ||
    value.length !== Math.ceil(bytes / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(value)
  )
    throw invalid();
  const result = Buffer.from(value, 'base64');
  if (result.length !== bytes || result.toString('base64') !== value)
    throw invalid();
  return result;
}
function verify(content: Buffer, expected: PrivateBackupIdentity) {
  if (
    !Buffer.isBuffer(content) ||
    content.length !== expected.bytes ||
    createHash('sha256').update(content).digest('hex') !== expected.sha256
  )
    throw invalid();
}

/** Bytes only, no file IO, provider writes, permission or retention restoration.
 * Caller owns authorization, DB locks, expiry checks and separate key custody.
 */
export function sealPrivateBackup(
  expected: PrivateBackupIdentity,
  content: Buffer,
  key: Buffer,
): PrivateBackupEnvelope {
  keyCheck(key);
  const meta = identity(expected);
  verify(content, meta);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad(meta));
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  return Object.freeze({
    version: 1,
    identity: Object.freeze(meta),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
  });
}

export function openPrivateBackup(
  envelope: unknown,
  expected: PrivateBackupIdentity,
  key: Buffer,
): Buffer {
  try {
    keyCheck(key);
    const meta = identity(expected);
    if (
      !object(envelope) ||
      Object.keys(envelope).length !== 5 ||
      !['version', 'identity', 'nonce', 'tag', 'ciphertext'].every((field) =>
        Object.prototype.hasOwnProperty.call(envelope, field),
      ) ||
      envelope.version !== 1
    )
      throw invalid();
    const source = identity(envelope.identity);
    if (!aad(source).equals(aad(meta))) throw invalid();
    const nonce = decode(envelope.nonce, 12),
      tag = decode(envelope.tag, 16);
    const ciphertext = decode(envelope.ciphertext, meta.bytes);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad(meta));
    decipher.setAuthTag(tag);
    const content = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    verify(content, meta);
    return content;
  } catch {
    // No provider errors, secret values, plaintext or ciphertext in errors/logs.
    throw invalid();
  }
}
