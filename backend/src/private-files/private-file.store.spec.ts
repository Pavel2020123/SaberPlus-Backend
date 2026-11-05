import { ServiceUnavailableException } from '@nestjs/common';
import { privateFileProvider } from './private-file.store';
import { LocalEditorialFileStore } from '../editorial-files/editorial-file.store';

const id = '2df4f385-fec2-4cb1-89af-91f67a476b52';
const env = {
  PRIVATE_FILE_PROVIDER: 'supabase',
  PRIVATE_SUPABASE_STORAGE_URL: 'http://127.0.0.1:43190/storage/v1',
  PRIVATE_SUPABASE_BUCKET: 'private-documents',
  PRIVATE_SUPABASE_SERVICE_KEY: 'synthetic-private-server-key',
  EDITORIAL_SUPABASE_BUCKET: 'editorial-images',
};
describe('private byte provider isolation (contract double)', () => {
  it('keeps local bytes in an independent private directory by default', () => {
    expect(privateFileProvider({})).toBeInstanceOf(LocalEditorialFileStore);
  });
  it.each([
    { ...env, PRIVATE_FILE_PROVIDER: 'unknown' },
    { ...env, PRIVATE_SUPABASE_BUCKET: 'editorial-images' },
    { ...env, PRIVATE_SUPABASE_BUCKET: '' },
    { ...env, PRIVATE_SUPABASE_SERVICE_KEY: '' },
  ])('fails closed for unsafe provider config %#', (config) => {
    expect(() => privateFileProvider(config)).toThrow(
      ServiceUnavailableException,
    );
  });
  it('stores opaque private bytes outside editorial paths without a public link', async () => {
    const bytes = Buffer.from('%PDF-1.7\nprivate synthetic bytes\n%%EOF');
    const request = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: env.PRIVATE_SUPABASE_BUCKET, public: false }),
        ),
      )
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(
        new Response(new Uint8Array(bytes), {
          headers: { 'content-type': 'application/octet-stream' },
        }),
      );
    await privateFileProvider(env, request).put(id, bytes);
    const url = request.mock.calls[1][0];
    if (!(url instanceof URL)) throw new Error('Expected a URL object');
    expect(url.href).toBe(
      `${env.PRIVATE_SUPABASE_STORAGE_URL}/object/private-documents/private/v1/${id}.bin`,
    );
    expect(request.mock.calls[1][1].headers).toMatchObject({
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'false',
      Authorization: 'Bearer synthetic-private-server-key',
    });
  });
  it('rejects a public private-files bucket before writing bytes', async () => {
    const request = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: env.PRIVATE_SUPABASE_BUCKET, public: true }),
        ),
      );
    await expect(
      privateFileProvider(env, request).put(id, Buffer.from('private')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
