import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const linuxPurpose = 'saberplus-competitive-linux-v1';

// Selective build context: never copy .env, uploads or host node_modules.
export async function prepareLinuxRuntime(backend, directory, nonce, docker) {
  const context = join(directory, 'linux-runtime');
  await mkdir(context);
  for (const file of ['package.json', 'package-lock.json'])
    await cp(join(backend, file), join(context, file));
  await cp(join(backend, 'dist'), join(context, 'dist'), { recursive: true });
  await mkdir(join(context, 'prisma'));
  await cp(
    join(backend, 'prisma/schema.prisma'),
    join(context, 'prisma/schema.prisma'),
  );
  await cp(
    join(backend, 'test/helpers/competitive-linux-nest.cjs'),
    join(context, 'linux-nest.cjs'),
  );
  await writeFile(
    join(context, 'Dockerfile'),
    `FROM node:24.14.1-bookworm
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY prisma/schema.prisma prisma/schema.prisma
RUN DATABASE_URL=postgresql://unused:unused@127.0.0.1/postgres DIRECT_URL=postgresql://unused:unused@127.0.0.1/postgres npx prisma generate
COPY dist dist
COPY linux-nest.cjs linux-nest.cjs
CMD ["node", "linux-nest.cjs"]
`,
  );
  const image = `saberplus-competitive-linux:${nonce}`;
  // Installation/image preparation has its own bound, outside file test deadlines.
  await docker(
    ['build', '--label', `${linuxPurpose}=${nonce}`, '--tag', image, context],
    600000,
  );
  return image;
}

export async function removeLinuxRuntime(image, nonce, docker) {
  const labels = JSON.parse(
    (
      await docker([
        'image',
        'inspect',
        '--format',
        '{{json .Config.Labels}}',
        image,
      ])
    ).stdout,
  );
  if (labels[linuxPurpose] !== nonce)
    throw new Error('Linux image ownership mismatch.');
  await docker(['image', 'rm', image]);
}

export async function cleanupLinuxResources(nonce, docker) {
  const ids = (
    await docker(['ps', '-aq', '--filter', `label=${linuxPurpose}=${nonce}`])
  ).stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const id of ids) {
    const labels = JSON.parse(
      (await docker(['inspect', '--format', '{{json .Config.Labels}}', id]))
        .stdout,
    );
    if (labels[linuxPurpose] !== nonce)
      throw new Error('Linux container ownership mismatch.');
    await docker(['rm', '--force', id]);
  }
  const networks = (
    await docker([
      'network',
      'ls',
      '-q',
      '--filter',
      `label=${linuxPurpose}=${nonce}`,
    ])
  ).stdout
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const id of networks) {
    const [network] = JSON.parse(
      (await docker(['network', 'inspect', id])).stdout,
    );
    if (network.Labels[linuxPurpose] !== nonce || !network.Internal)
      throw new Error('Linux network ownership mismatch.');
    for (const containerId of Object.keys(network.Containers ?? {})) {
      const labels = JSON.parse(
        (
          await docker([
            'inspect',
            '--format',
            '{{json .Config.Labels}}',
            containerId,
          ])
        ).stdout,
      );
      if (labels['saberplus-competitive-disposable-v1'] !== nonce)
        throw new Error('Foreign network endpoint; refusing cleanup.');
      await docker(['network', 'disconnect', id, containerId]);
    }
    await docker(['network', 'rm', id]);
  }
}
