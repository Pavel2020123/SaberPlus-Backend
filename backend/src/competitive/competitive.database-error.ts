/** Read database diagnostics without trusting the shape of a thrown value. */
export function databaseErrorCodes(error: unknown): {
  code?: string;
  sql?: string;
} {
  if (error === null || typeof error !== 'object') return {};
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;
  const meta = 'meta' in error ? error.meta : undefined;
  const sql =
    meta !== null &&
    typeof meta === 'object' &&
    'code' in meta &&
    typeof meta.code === 'string'
      ? meta.code
      : undefined;
  return { code, sql };
}
