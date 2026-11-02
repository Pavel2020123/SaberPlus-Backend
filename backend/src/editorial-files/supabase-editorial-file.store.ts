import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { EditorialFileStore } from './editorial-file.store';
import { EDITORIAL_OUTPUT_LIMIT } from './editorial-image';

export type EditorialSupabaseConfig = Readonly<{
  url: string;
  bucket: string;
  serviceKey: string;
}>;

const unavailable = () =>
  new ServiceUnavailableException(
    'El almacenamiento privado no está disponible. Consulta la operación antes de reintentar.',
  );

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Server-only REST adapter. No public URLs, signed links, bucket creation or upsert. */
export class SupabaseEditorialFileStore extends EditorialFileStore {
  private readonly base: URL;
  private readonly config: EditorialSupabaseConfig;

  constructor(
    config: EditorialSupabaseConfig,
    private readonly request: typeof fetch = fetch,
  ) {
    super();
    try {
      const url = new URL(config.url);
      if (
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        !['https:', 'http:'].includes(url.protocol) ||
        (url.protocol === 'http:' &&
          !['127.0.0.1', '[::1]'].includes(url.hostname)) ||
        !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(config.bucket) ||
        !config.serviceKey ||
        config.serviceKey.length > 8192 ||
        /\s/.test(config.serviceKey)
      )
        throw unavailable();
      url.pathname = `${url.pathname.replace(/\/$/, '')}/`;
      this.base = url;
      this.config = Object.freeze({ ...config });
    } catch {
      throw unavailable();
    }
  }

  private object(id: string) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      throw unavailable();
    return `${this.config.bucket}/editorial/v1/${id.toLowerCase()}.webp`;
  }

  private async call(path: string, init: RequestInit = {}) {
    try {
      return await this.request(new URL(path, this.base), {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        headers: {
          ...init.headers,
          Authorization: `Bearer ${this.config.serviceKey}`,
          apikey: this.config.serviceKey,
        },
      });
    } catch {
      throw unavailable();
    }
  }

  private async bytes(response: Response, limit: number) {
    const declared = response.headers.get('content-length');
    if (
      declared !== null &&
      (!/^\d+$/.test(declared) || Number(declared) > limit)
    ) {
      await response.body?.cancel();
      throw unavailable();
    }
    if (!response.body) throw unavailable();
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) throw unavailable();
        chunks.push(Buffer.from(value));
      }
      if (declared !== null && size !== Number(declared)) throw unavailable();
      return Buffer.concat(chunks, size);
    } catch {
      await reader.cancel().catch(() => undefined);
      throw unavailable();
    } finally {
      reader.releaseLock();
    }
  }

  private async privateBucket() {
    const response = await this.call(`bucket/${this.config.bucket}`);
    if (response.status !== 200) {
      await response.body?.cancel();
      throw unavailable();
    }
    try {
      const bucket: unknown = JSON.parse(
        (await this.bytes(response, 8192)).toString('utf8'),
      );
      if (
        !record(bucket) ||
        bucket.id !== this.config.bucket ||
        bucket.public !== false
      )
        throw unavailable();
    } catch {
      throw unavailable();
    }
  }

  private async download(path: string) {
    const response = await this.call(`object/authenticated/${path}`);
    if (
      response.status !== 200 ||
      response.headers.get('content-type')?.split(';')[0] !== 'image/webp'
    ) {
      await response.body?.cancel();
      throw unavailable();
    }
    const bytes = await this.bytes(response, EDITORIAL_OUTPUT_LIMIT);
    if (!bytes.length) throw unavailable();
    return bytes;
  }

  async put(id: string, input: Buffer) {
    const path = this.object(id);
    if (!input.length || input.length > EDITORIAL_OUTPUT_LIMIT)
      throw unavailable();
    // Do not let caller mutations change an in-flight upload/comparison.
    const bytes = Buffer.from(input);
    await this.privateBucket();
    const response = await this.call(`object/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/webp',
        'x-upsert': 'false',
        'cache-control': 'no-store',
      },
      body: new Uint8Array(bytes),
    });
    if ([200, 201].includes(response.status)) {
      await response.body?.cancel();
      // A response alone is not evidence that the stored bytes match.
      if (!(await this.download(path)).equals(bytes)) throw unavailable();
      return;
    }
    let duplicate = response.status === 409;
    if (response.status === 400) {
      try {
        const error: unknown = JSON.parse(
          (await this.bytes(response, 4096)).toString('utf8'),
        );
        duplicate =
          record(error) &&
          (error.error === 'Duplicate' ||
            error.code === 'ResourceAlreadyExists');
      } catch {
        throw unavailable();
      }
    } else {
      await response.body?.cancel();
    }
    if (!duplicate) throw unavailable();
    if (!(await this.download(path)).equals(bytes)) {
      throw new ConflictException('El archivo preparado tiene otro contenido.');
    }
  }

  async read(id: string) {
    const path = this.object(id);
    await this.privateBucket();
    return this.download(path);
  }

  async remove(id: string) {
    const path = this.object(id);
    await this.privateBucket();
    const response = await this.call(`object/${this.config.bucket}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prefixes: [path.slice(this.config.bucket.length + 1)],
      }),
    });
    await response.body?.cancel();
    if (![200, 204].includes(response.status)) throw unavailable();
    // Bulk deletion is idempotent for absent keys. Never infer success from 404,
    // which could also mean the bucket disappeared or permissions were denied.
  }
}
