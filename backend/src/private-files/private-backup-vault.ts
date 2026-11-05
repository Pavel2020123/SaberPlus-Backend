import { randomBytes, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  openPrivateBackup,
  PrivateBackupIdentity,
  sealPrivateBackup,
} from './private-backup-envelope';
import { PRIVATE_BYTES_LIMIT } from './private-local-file.store';

const unavailable = () => new Error('Respaldo privado no disponible.');
export const PRIVATE_BACKUP_VAULT = Symbol('PRIVATE_BACKUP_VAULT');
const hasCode = (error: unknown, code: string) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

/** Local operator transport only, injected into technical services, never HTTP.
 * Caller must serialize against DB owner locks, enforce access and DB deadlines.
 * Filesystem modes are not a claim about Windows ACLs or disaster recovery.
 */
export class LocalPrivateBackupVault {
  private readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }

  private id(id: string) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        id,
      )
    )
      throw unavailable();
  }
  private path(id: string, kind: 'keys' | 'envelopes' | 'retired') {
    this.id(id);
    return join(this.root, kind, id);
  }
  private async prepare() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const directory of [
      this.root,
      ...['keys', 'envelopes', 'retired'].map((part) => join(this.root, part)),
    ]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable();
    }
  }
  private async retired(id: string) {
    try {
      const stat = await lstat(this.path(id, 'retired'));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 0)
        throw unavailable();
      return true;
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return false;
      throw unavailable();
    }
  }
  async identity(): Promise<string> {
    await this.prepare();
    const path = join(this.root, 'vault.id');
    try {
      const existing = (await this.bounded(path, 36)).toString('ascii');
      this.id(existing);
      return existing;
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw unavailable();
    }
    const temporary = join(this.root, `vault-${randomUUID()}.part`);
    try {
      await writeFile(temporary, randomUUID(), { flag: 'wx', mode: 0o600 });
      try {
        await link(temporary, path);
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw unavailable();
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    const id = (await this.bounded(path, 36)).toString('ascii');
    this.id(id);
    return id;
  }
  private async bounded(path: string, limit: number): Promise<Buffer> {
    const stat = await lstat(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size < 1 ||
      stat.size > limit
    )
      throw unavailable();
    const handle = await open(path, 'r');
    try {
      const actual = await handle.stat();
      if (!actual.isFile() || actual.size !== stat.size) throw unavailable();
      const result = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < result.length) {
        const part = await handle.read(
          result,
          offset,
          Math.min(65536, result.length - offset),
          offset,
        );
        if (!part.bytesRead) throw unavailable();
        offset += part.bytesRead;
      }
      if ((await handle.read(Buffer.alloc(1), 0, 1, offset)).bytesRead)
        throw unavailable();
      return result;
    } finally {
      await handle.close();
    }
  }

  async save(expected: PrivateBackupIdentity, bytes: Buffer): Promise<void> {
    this.id(expected.id);
    await this.identity();
    if (await this.retired(expected.id)) throw unavailable();
    const keyPath = this.path(expected.id, 'keys');
    let key: Buffer | undefined;
    try {
      key = randomBytes(32);
      try {
        await writeFile(keyPath, key, { flag: 'wx', mode: 0o600 });
      } catch (error) {
        key.fill(0);
        if (!hasCode(error, 'EEXIST')) throw error;
        key = await this.bounded(keyPath, 32);
      }
      const envelope = sealPrivateBackup(expected, bytes, key);
      if (await this.retired(expected.id)) throw unavailable();
      try {
        // Exclusive publication. A partial write after a crash fails closed;
        // operators must inspect it, never silently overwrite another envelope.
        await writeFile(
          this.path(expected.id, 'envelopes'),
          JSON.stringify(envelope),
          { flag: 'wx', mode: 0o600 },
        );
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error;
        const existing = await this.read(expected);
        try {
          if (!existing.equals(bytes)) throw unavailable();
        } finally {
          existing.fill(0);
        }
      }
    } finally {
      key?.fill(0);
      // Retirement wins even when it raced a slow filesystem write.
      if (await this.retired(expected.id)) await this.retire(expected.id);
    }
    if (await this.retired(expected.id)) throw unavailable();
  }

  async read(expected: PrivateBackupIdentity): Promise<Buffer> {
    this.id(expected.id);
    await this.identity();
    if (await this.retired(expected.id)) throw unavailable();
    let key: Buffer | undefined;
    let bytes: Buffer | undefined;
    try {
      key = await this.bounded(this.path(expected.id, 'keys'), 32);
      const encoded = await this.bounded(
        this.path(expected.id, 'envelopes'),
        Math.ceil(PRIVATE_BYTES_LIMIT / 3) * 4 + 4096,
      );
      bytes = openPrivateBackup(
        JSON.parse(encoded.toString('utf8')),
        expected,
        key,
      );
      if (await this.retired(expected.id)) throw unavailable();
      return bytes;
    } catch {
      bytes?.fill(0);
      throw unavailable();
    } finally {
      key?.fill(0);
    }
  }

  async retire(id: string): Promise<void> {
    this.id(id);
    await this.identity();
    try {
      await writeFile(this.path(id, 'retired'), Buffer.alloc(0), {
        flag: 'wx',
        mode: 0o600,
      });
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) throw error;
    }
    if (!(await this.retired(id))) throw unavailable();
    // Marker remains as a minimal non-content receipt. Both payload and key
    // removals are retried even when either individual filesystem call fails.
    const results = await Promise.allSettled(
      ['keys', 'envelopes'].map(async (kind: 'keys' | 'envelopes') => {
        try {
          await unlink(this.path(id, kind));
        } catch (error) {
          if (!hasCode(error, 'ENOENT')) throw error;
        }
      }),
    );
    if (results.some((result) => result.status === 'rejected'))
      throw unavailable();
  }
}
