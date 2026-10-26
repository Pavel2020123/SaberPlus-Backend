import { Prisma } from '@prisma/client';
import {
  canReadBattleSnapshotImage,
  hasBattleSnapshotImageReference,
} from './editorial-battle-access';
import { EditorialFileRuntime } from './editorial-file-runtime';
import {
  freezeBattleQuestion,
  readBattleSnapshot,
  ownBattleHistoryQuestions,
} from '../batallas/batalla.snapshot';

describe('H2B3: copia y permisos de Batallas', () => {
  const id = '36cf70ac-c98b-40c4-9e40-d534f38dff36',
    owner = '54782f1a-6a81-4c7a-8243-02ef45c33262';
  const db = { $queryRaw: jest.fn() };
  beforeEach(() => jest.resetAllMocks());
  it('no consulta copias para otros orígenes y vincula el historial propio a una respuesta confirmada', async () => {
    expect(
      await ownBattleHistoryQuestions(db, owner, [{ id, origen: 'PRACTICA' }]),
    ).toEqual(new Map());
    expect(db.$queryRaw).not.toHaveBeenCalled();
    db.$queryRaw.mockResolvedValueOnce([]);
    expect(
      await ownBattleHistoryQuestions(db, owner, [{ id, origen: 'BATALLA' }]),
    ).toEqual(new Map());
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    expect(calls[0][0].values).toContain(owner);
    expect(calls[0][0].sql).toContain('"respuestaSeleccionadaId"');
    expect(calls[0][0].sql).toContain('"BatallaRespuesta"');
  });
  it('parametriza propietario/ruta y comprueba avance o respuesta propios', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ allowed: true }]);
    expect(await canReadBattleSnapshotImage(db, id.toUpperCase(), owner)).toBe(
      true,
    );
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    const query = calls[0][0];
    expect(query.values).toContain(owner);
    expect(query.values).toContain(`/recursos/editoriales/${id}`);
    expect(query.sql).not.toContain(owner);
    expect(query.sql).toContain('"BatallaParticipante"');
    expect(query.sql).toContain('"BatallaRespuesta"');
    expect(query.sql).toContain('COALESCE');
  });
  it('retiene referencias sin otorgar lectura y propaga fallos de la base', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ used: true }]);
    expect(await hasBattleSnapshotImageReference(db, id)).toBe(true);
    const calls = db.$queryRaw.mock.calls as unknown as [Prisma.Sql][];
    expect(calls[0][0].sql).not.toContain('usuarioId');
    db.$queryRaw.mockResolvedValueOnce([]);
    expect(await canReadBattleSnapshotImage(db, id, owner)).toBe(false);
    db.$queryRaw.mockRejectedValueOnce(new Error('Sin base'));
    await expect(hasBattleSnapshotImageReference(db, id)).rejects.toThrow(
      'Sin base',
    );
  });
  it('legado null se conserva y versiones desconocidas no se reconstruyen', () => {
    expect(readBattleSnapshot(null)).toBeNull();
    expect(readBattleSnapshot(undefined)).toBeNull();
    expect(() => readBattleSnapshot({ version: 2 })).toThrow();
  });
  it('congela texto, caso, orden y opciones sin guardar metadatos de archivo', () => {
    const source = {
      id: 'q',
      enunciado: 'Original',
      imagenUrl: null,
      explicacion: 'Explicación',
      caso: { contexto: 'Contexto', imagenUrl: `/recursos/editoriales/${id}` },
      subtema: { tema: { area: 'INGLES' } },
      respuestas: [
        {
          id: 'a',
          texto: 'A',
          esCorrecta: true,
          explicacion: null,
          imagenUrl: null,
          archivoImagenId: 'privado',
        },
        {
          id: 'b',
          texto: 'B',
          esCorrecta: false,
          explicacion: null,
          imagenUrl: null,
        },
      ],
    };
    const order = ['b', 'a'];
    const frozen = freezeBattleQuestion(
      source as unknown as Parameters<typeof freezeBattleQuestion>[0],
      0,
      order,
    );
    source.enunciado = 'Otro';
    source.caso.contexto = 'Otro';
    order.reverse();
    expect(frozen.pregunta.enunciado).toBe('Original');
    expect(frozen.pregunta.caso?.contexto).toBe('Contexto');
    expect(frozen.opcionesOrden).toEqual(['b', 'a']);
    expect(JSON.stringify(frozen)).not.toContain('archivoImagenId');
    expect(readBattleSnapshot(frozen)).toEqual(frozen);
  });
});

describe('H2B3 activación local', () => {
  const keys = [
    'NODE_ENV',
    'EDITORIAL_FILES_LOCAL_ENABLED',
    'EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED',
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
  ])('%s files=%s battle=%s => %s', (env, files, battle, expected) => {
    process.env.NODE_ENV = String(env);
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = String(files);
    process.env.EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED = String(battle);
    expect(new EditorialFileRuntime().battleSnapshotsEnabled()).toBe(expected);
  });
});
