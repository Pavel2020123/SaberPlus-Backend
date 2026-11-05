import { ServiceUnavailableException } from '@nestjs/common';
import { resolve } from 'node:path';
import { EditorialFileStore } from '../editorial-files/editorial-file.store';
import { SupabaseEditorialFileStore } from '../editorial-files/supabase-editorial-file.store';
import { PrivateLocalFileStore } from './private-local-file.store';

export const PRIVATE_FILE_STORE = Symbol('PRIVATE_FILE_STORE');

/** Shares only the immutable byte transport, not editorial routes/permissions. */
export function privateFileProvider(
  env: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): EditorialFileStore {
  const provider = env.PRIVATE_FILE_PROVIDER ?? 'local';
  if (provider === 'local')
    return new PrivateLocalFileStore(
      resolve(process.cwd(), '.tmp', 'private-files'),
    );
  if (provider !== 'supabase')
    throw new ServiceUnavailableException(
      'El proveedor privado no está configurado.',
    );
  const bucket = env.PRIVATE_SUPABASE_BUCKET ?? '';
  // Separate bucket as well as namespace; do not relax editorial object policies.
  if (!bucket || bucket === env.EDITORIAL_SUPABASE_BUCKET)
    throw new ServiceUnavailableException(
      'Configura un bucket privado independiente.',
    );
  return new SupabaseEditorialFileStore(
    {
      url: env.PRIVATE_SUPABASE_STORAGE_URL ?? '',
      bucket,
      serviceKey: env.PRIVATE_SUPABASE_SERVICE_KEY ?? '',
    },
    request,
    'private',
  );
}
