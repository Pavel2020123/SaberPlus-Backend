import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseEditorialFileStore } from './supabase-editorial-file.store';
import { editorialFileProvider } from './editorial-file-provider';
import { LocalEditorialFileStore } from './editorial-file.store';

const id = '2df4f385-fec2-4cb1-89af-91f67a476b52';
const config = {
  url: 'http://127.0.0.1:43190/storage/v1',
  bucket: 'editorial-private',
  serviceKey: 'synthetic-server-secret',
};
const image = Buffer.from('synthetic-normalized-webp');
const requestUrl = (input: Parameters<typeof fetch>[0]): URL => {
  if (!(input instanceof URL)) throw new Error('Expected a URL object');
  return input;
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const picture = (bytes: Buffer = image) =>
  new Response(new Uint8Array(bytes), {
    headers: { 'content-type': 'image/webp' },
  });

describe('Supabase editorial server adapter (contract double, not real Storage)', () => {
  let request: jest.Mock<Promise<Response>, Parameters<typeof fetch>>;
  let store: SupabaseEditorialFileStore;
  beforeEach(() => {
    request = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    store = new SupabaseEditorialFileStore(config, request);
  });
  const privateBucket = () => json({ id: config.bucket, public: false });
  it('keeps local as default and rejects unknown/incomplete providers without a fallback', () => {
    expect(editorialFileProvider('synthetic-root', {})).toBeInstanceOf(
      LocalEditorialFileStore,
    );
    expect(() =>
      editorialFileProvider('synthetic-root', {
        EDITORIAL_FILE_PROVIDER: 'other',
      }),
    ).toThrow(ServiceUnavailableException);
    expect(() =>
      editorialFileProvider('synthetic-root', {
        EDITORIAL_FILE_PROVIDER: 'supabase',
      }),
    ).toThrow(ServiceUnavailableException);
  });
  it.each([
    { ...config, url: 'http://remote.invalid' },
    { ...config, url: 'https://user:password@example.invalid' },
    { ...config, url: 'https://example.invalid?token=secret' },
    { ...config, url: 'file:///tmp/private' },
    { ...config, bucket: '../public' },
    { ...config, serviceKey: 'bad\nheader' },
    { ...config, serviceKey: '' },
  ])('rejects unsafe configuration without leaking it', (invalid) => {
    expect(() => new SupabaseEditorialFileStore(invalid, request)).toThrow(
      ServiceUnavailableException,
    );
    expect(request).not.toHaveBeenCalled();
  });
  it('uploads without upsert, authenticates and verifies stored bytes', async () => {
    request
      .mockResolvedValueOnce(privateBucket())
      .mockResolvedValueOnce(json({ Key: 'ignored' }))
      .mockResolvedValueOnce(picture());
    await store.put(id.toUpperCase(), image);
    const [url, options] = request.mock.calls[1];
    expect(requestUrl(url).href).toBe(
      `${config.url}/object/${config.bucket}/editorial/v1/${id}.webp`,
    );
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${config.serviceKey}`,
      apikey: config.serviceKey,
      'x-upsert': 'false',
    });
    expect(options.redirect).toBe('error');
    expect(request).toHaveBeenCalledTimes(3);
  });
  it.each([400, 409])(
    'an identical duplicate %s is reconciled without overwrite',
    async (status) => {
      request
        .mockResolvedValueOnce(privateBucket())
        .mockResolvedValueOnce(json({ error: 'Duplicate' }, status))
        .mockResolvedValueOnce(picture());
      await store.put(id, image);
      expect(
        request.mock.calls.filter(([, options]) => options.method === 'POST'),
      ).toHaveLength(1);
    },
  );
  it('different bytes at the same key are a conflict, never an overwrite', async () => {
    request
      .mockResolvedValueOnce(privateBucket())
      .mockResolvedValueOnce(json({}, 409))
      .mockResolvedValueOnce(picture(Buffer.from('different')));
    await expect(store.put(id, image)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('a successful upload response cannot hide corrupt persistence', async () => {
    request
      .mockResolvedValueOnce(privateBucket())
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(picture(Buffer.from('bad')));
    await expect(store.put(id, image)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it.each([true, undefined, 'false'])(
    'a bucket not explicitly private (%s) stops before object IO',
    async (value) => {
      request.mockResolvedValueOnce(json({ id: config.bucket, public: value }));
      await expect(store.read(id)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it('reads private bytes with the authenticated route only', async () => {
    request
      .mockResolvedValueOnce(privateBucket())
      .mockResolvedValueOnce(picture());
    expect(await store.read(id)).toEqual(image);
    expect(requestUrl(request.mock.calls[1][0]).pathname).toContain(
      '/object/authenticated/',
    );
  });
  it('deletes only the exact key using idempotent bulk delete, never the bucket', async () => {
    request
      .mockResolvedValueOnce(privateBucket())
      .mockResolvedValueOnce(json([]));
    await store.remove(id);
    const [url, options] = request.mock.calls[1];
    expect(requestUrl(url).pathname).toBe(
      `/storage/v1/object/${config.bucket}`,
    );
    expect(options.method).toBe('DELETE');
    expect(JSON.parse(options.body as string)).toEqual({
      prefixes: [`editorial/v1/${id}.webp`],
    });
  });
  it.each([401, 403, 404, 500, 503])(
    'never treats a failed provider response %s as valid content',
    async (status) => {
      request
        .mockResolvedValueOnce(privateBucket())
        .mockResolvedValueOnce(json({ secret: 'must-not-escape' }, status));
      await expect(store.read(id)).rejects.toThrow(
        'El almacenamiento privado no está disponible.',
      );
    },
  );
  it('does not expose provider network errors or secrets', async () => {
    request.mockRejectedValueOnce(
      new Error(`network ${config.serviceKey} ${config.url}`),
    );
    await expect(store.read(id)).rejects.toThrow(
      'El almacenamiento privado no está disponible.',
    );
  });
  it('bounds a streamed response even when content-length is missing', async () => {
    request.mockResolvedValueOnce(privateBucket()).mockResolvedValueOnce(
      new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
        headers: { 'content-type': 'image/webp' },
      }),
    );
    await expect(store.read(id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it('rejects advertised excessive response length before consuming it', async () => {
    request.mockResolvedValueOnce(privateBucket()).mockResolvedValueOnce(
      new Response('small', {
        headers: {
          'content-type': 'image/webp',
          'content-length': '999999999',
        },
      }),
    );
    await expect(store.read(id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
  it.each(['../other', `${id}/../x`, 'not-an-id'])(
    'rejects invalid object identity %s before network IO',
    async (key) => {
      await expect(store.read(key)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(request).not.toHaveBeenCalled();
    },
  );
  it('never passes arbitrary upload failures off as duplicate success', async () => {
    request
      .mockResolvedValueOnce(privateBucket())
      .mockResolvedValueOnce(json({ error: 'Unauthorized' }, 400));
    await expect(store.put(id, image)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(request).toHaveBeenCalledTimes(2);
  });
});
