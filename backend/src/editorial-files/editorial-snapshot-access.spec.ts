import { Prisma } from '@prisma/client';
import {
  canReadSoloSnapshotImage,
  hasSoloSnapshotImageReference,
} from './editorial-snapshot-access';
import { EditorialFileRuntime } from './editorial-file-runtime';

describe('H2A consulta de snapshots explícitos', () => {
  const id = '40df4f38-fec2-4cb1-89af-91f67a476b52';
  const owner = 'af6119b0-0ab2-4c7d-9dd7-a6dfdfb0cdbe';
  const db = { $queryRaw: jest.fn() };
  beforeEach(() => jest.resetAllMocks());
  it('vincula por parámetros UUID/propietario y reconoce solo tres formatos del servidor', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ allowed: true }]);
    expect(await canReadSoloSnapshotImage(db, id.toUpperCase(), owner)).toBe(
      true,
    );
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    const query = calls[0][0];
    expect(query.sql).toContain('"IntentoCima"');
    expect(query.sql).toContain('"IntentoGuardian"');
    expect(query.sql).toContain('"IntentoRescateEstrellas"');
    expect(query.sql).not.toContain(owner);
    expect(query.sql).not.toContain('IntentoTriviaRush');
    expect(query.values).toContain(owner);
    expect(query.values).toContain(`/recursos/editoriales/${id}`);
    expect(query.sql).toContain('WITH ORDINALITY');
    expect(query.sql).toContain('NOT EXISTS');
  });
  it('conservación de bytes es independiente de propiedad, exposición y activación', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ used: true }]);
    expect(await hasSoloSnapshotImageReference(db, id)).toBe(true);
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    expect(calls[0][0].sql).not.toContain('usuarioId');
    expect(calls[0][0].sql).not.toContain('venceEn');
  });
  it('un resultado negativo no inventa permisos y los errores SQL no se silencian', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ allowed: false }]);
    expect(await canReadSoloSnapshotImage(db, id, owner)).toBe(false);
    db.$queryRaw.mockRejectedValueOnce(new Error('SQL no disponible'));
    await expect(canReadSoloSnapshotImage(db, id, owner)).rejects.toThrow(
      'SQL no disponible',
    );
  });
});

describe('H2A solo local y apagado por defecto', () => {
  const keys = [
    'NODE_ENV',
    'EDITORIAL_FILES_LOCAL_ENABLED',
    'EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED',
  ];
  const saved = keys.map((key) => process.env[key]);
  afterAll(() =>
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    }),
  );
  it.each([
    ['test', 'true', 'true', true],
    ['development', 'true', 'true', true],
    ['production', 'true', 'true', false],
    ['staging', 'true', 'true', false],
    ['test', 'true', '', false],
    ['test', 'false', 'true', false],
  ])('%s archivos=%s snapshots=%s => %s', (env, files, snapshots, expected) => {
    process.env.NODE_ENV = String(env);
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = String(files);
    process.env.EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED =
      String(snapshots);
    expect(new EditorialFileRuntime().snapshotsEnabled()).toBe(expected);
  });
});
