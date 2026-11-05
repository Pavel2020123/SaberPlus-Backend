import { ServiceUnavailableException } from '@nestjs/common';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PrivateLocalFileStore,
  PRIVATE_BYTES_LIMIT,
} from './private-local-file.store';

const id = '2df4f385-fec2-4cb1-89af-91f67a476b52';
describe('bounded private local transport, real temporary files', () => {
  let directory: string;
  let store: PrivateLocalFileStore;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'saberplus-private-bounded-'));
    store = new PrivateLocalFileStore(directory);
  });
  afterEach(async () => {
    // Only the exact object created by this test; no recursive workspace cleanup.
    await unlink(join(directory, `${id}.webp`)).catch(() => undefined);
    await rmdir(directory);
  });
  it('round trips exact maximum private bytes and preserves immutable publication', async () => {
    const bytes = Buffer.alloc(PRIVATE_BYTES_LIMIT, 37);
    await store.put(id, bytes);
    expect((await store.read(id)).equals(bytes)).toBe(true);
    await expect(store.put(id, Buffer.from('other'))).rejects.toThrow();
    expect((await store.read(id)).equals(bytes)).toBe(true);
  });
  it.each([0, PRIVATE_BYTES_LIMIT + 1])(
    'refuses size %s on write and existing disk objects',
    async (size) => {
      const bytes = Buffer.alloc(size);
      await expect(store.put(id, bytes)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await writeFile(join(directory, `${id}.webp`), bytes, { flag: 'wx' });
      await expect(store.read(id)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(
        store.put(id, Buffer.from('bounded retry')),
      ).rejects.toThrow();
    },
  );
  it('does not accept paths or disclose local failure details', async () => {
    await expect(store.read('../outside')).rejects.toThrow(
      'Archivo privado no disponible.',
    );
    await expect(store.read(id)).rejects.toThrow(
      'Archivo privado no disponible.',
    );
  });
});
