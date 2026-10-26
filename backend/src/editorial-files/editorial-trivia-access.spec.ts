import { Prisma } from '@prisma/client';
import {
  canReadTriviaSnapshotImage,
  hasTriviaSnapshotImageReference,
} from './editorial-trivia-access';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { readTriviaSnapshot } from '../trivia-rush/trivia-rush.snapshot';

describe('H2B1: formatos privados Trivia/Fantasma y CPU', () => {
  const id = '40df4f38-fec2-4cb1-89af-91f67a476b52';
  const owner = 'af6119b0-0ab2-4c7d-9dd7-a6dfdfb0cdbe';
  const db = { $queryRaw: jest.fn() };
  beforeEach(() => jest.resetAllMocks());
  it('usa parámetros y confirmaciones finales, sin confundirlas con segundos intentos', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ allowed: true }]);
    expect(await canReadTriviaSnapshotImage(db, id.toUpperCase(), owner)).toBe(
      true,
    );
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    const query = calls[0][0];
    expect(query.sql).toContain('"snapshotInicial"');
    expect(query.sql).toContain('"snapshotLocal"');
    expect(query.sql).toContain('r."esFinal"');
    expect(query.sql).toContain('"preguntaActualId"');
    expect(query.sql).toContain('COALESCE');
    expect(query.sql).not.toContain(owner);
    expect(query.values).toContain(owner);
    expect(query.values).toContain(`/recursos/editoriales/${id}`);
  });
  it('la protección de retirada no otorga permisos y no depende del flag', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ used: true }]);
    expect(await hasTriviaSnapshotImageReference(db, id)).toBe(true);
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    expect(calls[0][0].sql).not.toContain('usuarioId');
    expect(calls[0][0].sql).not.toContain('esFinal');
  });
  it('no transforma un fallo SQL en permiso o en ausencia de referencias', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ allowed: false }]);
    expect(await canReadTriviaSnapshotImage(db, id, owner)).toBe(false);
    db.$queryRaw.mockRejectedValueOnce(new Error('Base no disponible'));
    await expect(hasTriviaSnapshotImageReference(db, id)).rejects.toThrow(
      'Base no disponible',
    );
  });
  it('lee nuevas copias CPU de cuatro preguntas sin convertirlas en evidencia competitiva', () => {
    const snapshot = {
      version: 1,
      q: 4,
      config: { modalidad: 'TUG_LOCAL', duracionSegundos: 600 },
      questions: [{}, {}, {}, {}],
      ghost: null,
    };
    expect(
      readTriviaSnapshot({
        modalidad: 'TUG_LOCAL',
        evidenciaVersion: null,
        snapshotLocal: snapshot,
      }),
    ).toEqual(snapshot);
    expect(
      readTriviaSnapshot({
        modalidad: 'TUG_LOCAL',
        evidenciaVersion: null,
        snapshotLocal: null,
      }),
    ).toBeNull();
    expect(() =>
      readTriviaSnapshot({
        modalidad: 'TRIVIA_RUSH',
        evidenciaVersion: 1,
        snapshotLocal: snapshot,
      }),
    ).toThrow();
    expect(() =>
      readTriviaSnapshot({
        modalidad: 'TUG_LOCAL',
        snapshotLocal: { ...snapshot, q: 3 },
      }),
    ).toThrow();
  });
});

describe('H2B1 opt-in local', () => {
  const keys = [
    'NODE_ENV',
    'EDITORIAL_FILES_LOCAL_ENABLED',
    'EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED',
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
  ])('%s archivos=%s trivia=%s => %s', (env, files, trivia, expected) => {
    process.env.NODE_ENV = String(env);
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = String(files);
    process.env.EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED = String(trivia);
    expect(new EditorialFileRuntime().triviaSnapshotsEnabled()).toBe(expected);
  });
});
