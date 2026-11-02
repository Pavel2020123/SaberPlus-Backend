import { ServiceUnavailableException } from '@nestjs/common';
import {
  LocalEditorialFileStore,
  EditorialFileStore,
} from './editorial-file.store';
import { SupabaseEditorialFileStore } from './supabase-editorial-file.store';

/** Provider selection does not activate editorial routes or change their guards. */
export function editorialFileProvider(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): EditorialFileStore {
  const provider = env.EDITORIAL_FILE_PROVIDER ?? 'local';
  if (provider === 'local') return new LocalEditorialFileStore(root);
  if (provider === 'supabase') {
    return new SupabaseEditorialFileStore({
      url: env.EDITORIAL_SUPABASE_STORAGE_URL ?? '',
      bucket: env.EDITORIAL_SUPABASE_BUCKET ?? '',
      serviceKey: env.EDITORIAL_SUPABASE_SERVICE_KEY ?? '',
    });
  }
  throw new ServiceUnavailableException(
    'El proveedor de archivos no está configurado.',
  );
}
