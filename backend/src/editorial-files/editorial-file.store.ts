import {
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const EDITORIAL_FILE_ROOT = Symbol('EDITORIAL_FILE_ROOT');

export abstract class EditorialFileStore {
  abstract put(id: string, bytes: Buffer): Promise<void>;
  abstract read(id: string): Promise<Buffer>;
  abstract remove(id: string): Promise<void>;
}

const hasCode = (error: unknown, code: string) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

@Injectable()
export class LocalEditorialFileStore extends EditorialFileStore {
  constructor(@Inject(EDITORIAL_FILE_ROOT) private readonly root: string) {
    super();
  }

  private path(id: string) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      throw new Error('Identificador de archivo no válido.');
    return join(this.root, `${id}.webp`);
  }

  async put(id: string, bytes: Buffer) {
    const target = this.path(id);
    const temporary = join(this.root, `${id}-${randomUUID()}.part`);
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      try {
        // El enlace publica los bytes completos sin reemplazar otro reintento.
        await link(temporary, target);
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) throw error;
        const existing = await readFile(target);
        if (!existing.equals(bytes))
          throw new ConflictException(
            'El archivo preparado tiene otro contenido.',
          );
      }
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(
        'No pudimos conservar el archivo. Consulta la operación antes de reenviar.',
      );
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async read(id: string) {
    try {
      return await readFile(this.path(id));
    } catch {
      throw new ServiceUnavailableException(
        'El archivo no está disponible en este almacenamiento.',
      );
    }
  }

  async remove(id: string) {
    try {
      await unlink(this.path(id));
    } catch (error) {
      if (!hasCode(error, 'ENOENT'))
        throw new ServiceUnavailableException(
          'No pudimos terminar la retirada del archivo. Reinténtala.',
        );
    }
  }
}
