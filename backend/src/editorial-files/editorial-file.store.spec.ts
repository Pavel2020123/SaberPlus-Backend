import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { LocalEditorialFileStore } from './editorial-file.store';

describe('adaptador privado local de archivos', () => {
  let root: string;
  let store: LocalEditorialFileStore;
  const id = '2df4f385-fec2-4cb1-89af-91f67a476b52';
  const bytes = Buffer.from('bytes normalizados por el servicio');

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'saberplus-c5-store-'));
    store = new LocalEditorialFileStore(root);
  });
  afterEach(async () => {
    // Solo el directorio temporal creado por esta prueba, nunca una ruta de entrada.
    if (
      dirname(resolve(root)) !== resolve(tmpdir()) ||
      !basename(root).startsWith('saberplus-c5-store-')
    )
      throw new Error('Destino temporal inesperado');
    await rm(root, { recursive: true, force: true });
  });

  it('persiste entre instancias sin guardar nombres de archivo del usuario', async () => {
    await store.put(id, bytes);
    expect(await new LocalEditorialFileStore(root).read(id)).toEqual(bytes);
    expect(await readdir(root)).toEqual([`${id}.webp`]);
  });

  it('varios reintentos concurrentes dejan un único archivo completo', async () => {
    await Promise.all(Array.from({ length: 8 }, () => store.put(id, bytes)));
    expect(await store.read(id)).toEqual(bytes);
    expect(await readdir(root)).toEqual([`${id}.webp`]);
  });

  it('un reintento con bytes distintos no reemplaza el archivo', async () => {
    await store.put(id, bytes);
    await expect(
      store.put(id, Buffer.from('otro contenido')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await store.read(id)).toEqual(bytes);
    expect(await readdir(root)).toEqual([`${id}.webp`]);
  });

  it('retirar varias veces funciona incluso si el archivo ya no existe', async () => {
    await store.put(id, bytes);
    await store.remove(id);
    await store.remove(id);
    expect(await readdir(root)).toEqual([]);
  });

  it('un fallo de lectura no expone la ruta del servidor', async () => {
    await expect(store.read(id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(store.read(id)).rejects.not.toThrow(root);
  });

  it.each(['../otra-carpeta', 'C:\\archivo.webp', 'id', `${id}/../x`])(
    'rechaza claves ajenas al contrato: %s',
    async (key) => {
      await expect(store.put(key, bytes)).rejects.toThrow();
      expect(await readdir(root)).toEqual([]);
    },
  );

  it('un directorio no disponible falla sin dejar un archivo parcial', async () => {
    const blocked = join(root, 'bloqueado');
    await writeFile(blocked, bytes);
    const unavailable = new LocalEditorialFileStore(blocked);
    await expect(unavailable.put(id, bytes)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(await readFile(blocked)).toEqual(bytes);
    expect(await readdir(root)).toEqual(['bloqueado']);
  });
});
