import { createHash } from 'node:crypto';
import { Stats } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalPrivateBackupVault } from './private-backup-vault';
import { PrivateBackupIdentity } from './private-backup-envelope';

const id = '2df4f385-fec2-4cb1-89af-91f67a476b52';
const other = '3df4f385-fec2-4cb1-89af-91f67a476b52';
const bytes = Buffer.from('%PDF-1.7\nSynthetic private vault fixture\n%%EOF');
const meta: PrivateBackupIdentity = {
  id,
  bytes: bytes.length,
  mime: 'application/pdf',
  sha256: createHash('sha256').update(bytes).digest('hex'),
};

describe('local encrypted private vault (real owned temporary files)', () => {
  let directory: string;
  let vault: LocalPrivateBackupVault;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'saberplus-private-vault-'));
    vault = new LocalPrivateBackupVault(directory);
  });
  afterEach(async () => {
    // Exact synthetic objects only, no recursive removal or user-selected paths.
    for (const kind of ['keys', 'envelopes', 'retired']) {
      for (const file of [id, other]) {
        const target = join(directory, kind, file);
        let stat: Stats | undefined;
        try {
          stat = await lstat(target);
        } catch (error: unknown) {
          if (
            !(
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              error.code === 'ENOENT'
            )
          )
            throw error;
        }
        if (stat?.isFile()) await unlink(target);
        else if (stat?.isDirectory()) await rmdir(target);
      }
      await rmdir(join(directory, kind)).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        },
      );
    }
    await unlink(join(directory, 'vault.id')).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      },
    );
    await rmdir(directory);
  });
  it('persists encrypted bytes and a separate key, readable after process object restart', async () => {
    await vault.save(meta, bytes);
    const stored = await readFile(join(directory, 'envelopes', id), 'utf8');
    expect(stored).not.toContain(bytes.toString('base64'));
    expect(stored).not.toContain('Synthetic private vault fixture');
    expect((await readFile(join(directory, 'keys', id))).length).toBe(32);
    expect(
      (await new LocalPrivateBackupVault(directory).read(meta)).equals(bytes),
    ).toBe(true);
    expect(await new LocalPrivateBackupVault(directory).identity()).toBe(
      await vault.identity(),
    );
  });
  it('replays idempotently but never overwrites a different backup', async () => {
    await vault.save(meta, bytes);
    const before = await readFile(join(directory, 'envelopes', id));
    await vault.save(meta, bytes);
    expect(
      (await readFile(join(directory, 'envelopes', id))).equals(before),
    ).toBe(true);
    const different = Buffer.from('%PDF-1.7\nDifferent fixture\n%%EOF');
    await expect(
      vault.save(
        {
          ...meta,
          bytes: different.length,
          sha256: createHash('sha256').update(different).digest('hex'),
        },
        different,
      ),
    ).rejects.toThrow();
    expect((await vault.read(meta)).equals(bytes)).toBe(true);
  });
  it('retires payload and key durably without touching another object', async () => {
    await vault.save(meta, bytes);
    await vault.save({ ...meta, id: other }, bytes);
    await vault.retire(id);
    for (const kind of ['keys', 'envelopes']) {
      await expect(lstat(join(directory, kind, id))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
    const restarted = new LocalPrivateBackupVault(directory);
    await expect(restarted.read(meta)).rejects.toThrow();
    await expect(restarted.save(meta, bytes)).rejects.toThrow();
    expect((await restarted.read({ ...meta, id: other })).equals(bytes)).toBe(
      true,
    );
    await restarted.retire(id);
  });
  it('retirement wins a simultaneous publication and prevents later resurrection', async () => {
    await Promise.all([
      vault.save(meta, bytes).catch(() => undefined),
      vault.retire(id),
    ]);
    await expect(vault.read(meta)).rejects.toThrow();
    for (const kind of ['keys', 'envelopes']) {
      await expect(lstat(join(directory, kind, id))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
  });
  it('fails closed on a corrupt envelope and rejects path-like identities', async () => {
    await vault.save(meta, bytes);
    await writeFile(join(directory, 'envelopes', id), '{partial');
    await expect(vault.read(meta)).rejects.toThrow(
      'Respaldo privado no disponible.',
    );
    await expect(vault.save(meta, bytes)).rejects.toThrow();
    await expect(vault.retire('../outside')).rejects.toThrow();
  });
  it('keeps the retirement marker when cleanup fails and permits retry', async () => {
    await vault.save(meta, bytes);
    await unlink(join(directory, 'keys', id));
    await mkdir(join(directory, 'keys', id)); // Simulates an undeletable key entry.
    await expect(vault.retire(id)).rejects.toThrow();
    await expect(vault.read(meta)).rejects.toThrow();
    await expect(lstat(join(directory, 'envelopes', id))).rejects.toMatchObject(
      { code: 'ENOENT' },
    );
    await rmdir(join(directory, 'keys', id));
    await new LocalPrivateBackupVault(directory).retire(id);
    expect((await lstat(join(directory, 'retired', id))).size).toBe(0);
  });
});
