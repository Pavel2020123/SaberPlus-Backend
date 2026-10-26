import { Prisma } from '@prisma/client';
import {
  canReadTugSnapshotImage,
  hasTugSnapshotImageReference,
} from './editorial-tug-access';
import { EditorialFileRuntime } from './editorial-file-runtime';

describe('H2B2: imágenes originales de Tira online', () => {
  const id = '2f70558f-e84f-459c-9b7a-5020905b4c41';
  const owner = '7aca89a6-f129-43c4-a56e-88228ad5871b';
  const db = { $queryRaw: jest.fn() };
  beforeEach(() => jest.resetAllMocks());
  it('parametriza identidad y ruta y exige la presentación individual y certificado cuando corresponde', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ allowed: true }]);
    expect(await canReadTugSnapshotImage(db, id.toUpperCase(), owner)).toBe(
      true,
    );
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    const query = calls[0][0];
    expect(query.values).toContain(owner);
    expect(query.values).toContain(`/recursos/editoriales/${id}`);
    expect(query.sql).not.toContain(owner);
    expect(query.sql).toContain('"TiraAflojaRondaPresentada"');
    expect(query.sql).toContain('"TugRoundVisibility"');
    expect(query.sql).not.toContain("->'contexto'->>'imagenUrl'");
  });
  it('retiene referencias futuras/contexto sin conceder lectura', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ used: true }]);
    expect(await hasTugSnapshotImageReference(db, id)).toBe(true);
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    expect(calls[0][0].sql).not.toContain('usuarioId');
    expect(calls[0][0].values).toContain(
      JSON.stringify({
        questions: [
          {
            pregunta: {
              contexto: { imagenUrl: `/recursos/editoriales/${id}` },
            },
          },
        ],
      }),
    );
  });
  it('ausencia o fallo SQL no conceden permiso', async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    expect(await canReadTugSnapshotImage(db, id, owner)).toBe(false);
    db.$queryRaw.mockRejectedValueOnce(new Error('Base no disponible'));
    await expect(canReadTugSnapshotImage(db, id, owner)).rejects.toThrow(
      'Base no disponible',
    );
  });
});

describe('H2B2 activación local independiente', () => {
  const keys = [
    'NODE_ENV',
    'EDITORIAL_FILES_LOCAL_ENABLED',
    'EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED',
  ];
  const original = keys.map((key) => process.env[key]);
  afterAll(() =>
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    }),
  );
  it.each([
    ['test', 'true', 'true', true],
    ['development', 'true', 'true', true],
    ['production', 'true', 'true', false],
    ['staging', 'true', 'true', false],
    ['test', 'true', '', false],
    ['test', 'false', 'true', false],
  ])('%s files=%s tug=%s => %s', (env, files, tug, expected) => {
    process.env.NODE_ENV = String(env);
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = String(files);
    process.env.EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED = String(tug);
    expect(new EditorialFileRuntime().tugSnapshotsEnabled()).toBe(expected);
  });
});
