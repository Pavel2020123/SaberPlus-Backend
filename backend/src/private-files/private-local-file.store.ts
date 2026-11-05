import { ServiceUnavailableException } from '@nestjs/common';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalEditorialFileStore } from '../editorial-files/editorial-file.store';

export const PRIVATE_BYTES_LIMIT = 5 * 1024 * 1024;

/** Same immutable local transport; private reads are bounded before allocation. */
export class PrivateLocalFileStore extends LocalEditorialFileStore {
  constructor(private readonly privateRoot: string) {
    super(privateRoot);
  }

  async put(id: string, bytes: Buffer) {
    if (!bytes.length || bytes.length > PRIVATE_BYTES_LIMIT)
      throw new ServiceUnavailableException(
        'Tamaño de archivo privado no válido.',
      );
    return super.put(id, bytes);
  }

  async read(id: string) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      throw new ServiceUnavailableException('Archivo privado no disponible.');
    const handle = await open(join(this.privateRoot, `${id}.webp`), 'r').catch(
      () => {
        throw new ServiceUnavailableException('Archivo privado no disponible.');
      },
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > PRIVATE_BYTES_LIMIT)
        throw new Error('Invalid private object size');
      // A growing/replaced object cannot cause an unbounded readFile allocation.
      const output = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < output.length) {
        const result = await handle.read(
          output,
          offset,
          Math.min(65536, output.length - offset),
          offset,
        );
        if (!result.bytesRead) throw new Error('Truncated private object');
        offset += result.bytesRead;
      }
      const extra = await handle.read(Buffer.alloc(1), 0, 1, offset);
      if (extra.bytesRead) throw new Error('Growing private object');
      return output;
    } catch {
      throw new ServiceUnavailableException('Archivo privado no disponible.');
    } finally {
      await handle.close();
    }
  }
}
