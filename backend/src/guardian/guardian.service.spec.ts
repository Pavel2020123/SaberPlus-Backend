import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AreaIcfes,
  Dificultad,
  IntentoGuardian,
  Prisma,
  RolUsuario,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GuardianService } from './guardian.service';

const config = { area: AreaIcfes.MATEMATICAS, dificultad: Dificultad.BASICO };
const userId = 'student-1';

describe('GuardianService', () => {
  let harness: ReturnType<typeof createHarness>;
  let service: GuardianService;

  beforeEach(() => {
    harness = createHarness();
    service = new GuardianService(harness.prisma);
  });

  it.each([RolUsuario.PROFESOR, RolUsuario.ADMIN, null])(
    'rejects all operations for role %s before reading attempts',
    async (role) => {
      harness.usuario.findUnique.mockResolvedValue(role ? { rol: role } : null);
      for (const action of [
        () => service.start(userId, config),
        () => service.active(userId),
        () => service.get(userId, 'other'),
        () => service.answer(userId, 'other', submission('q1', true)),
        () => service.abandon(userId, 'other'),
      ])
        await expect(action()).rejects.toBeInstanceOf(ForbiddenException);
      expect(harness.transaction).not.toHaveBeenCalled();
    },
  );

  it('starts using the published hierarchy and never returns future questions or keys', async () => {
    const state = await service.start(userId, {
      ...config,
      subtemaId: 'sub-1',
    });
    expect(harness.pregunta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { estadoContenido: 'PUBLICADO' },
            {
              subtema: {
                estadoContenido: 'PUBLICADO',
                tema: { estadoContenido: 'PUBLICADO' },
              },
            },
            {
              OR: [
                { casoId: null },
                { caso: { is: { estadoContenido: 'PUBLICADO' } } },
              ],
            },
            {
              dificultad: config.dificultad,
              subtemaId: 'sub-1',
              subtema: { tema: { area: config.area } },
            },
          ]),
        },
      }),
    );
    expect(state.revision).toEqual([]);
    expect(state.pregunta).toMatchObject({
      imagenUrl: '/image.png',
      caso: { contexto: 'Read this passage.' },
    });
    expect(JSON.stringify(state)).not.toMatch(
      /correctAnswerId|SECRET|esCorrecta/,
    );
    expect(state).not.toHaveProperty('preguntas');
    const stored = harness.rows.get(state.id)!;
    expect(stored.preguntas).toHaveLength(8);
    expect(
      new Set((stored.preguntas as any[]).map((q) => q.question.id)).size,
    ).toBe(8);
  });

  it('keeps an existing matching attempt and rejects a different configuration', async () => {
    const first = await service.start(userId, config);
    expect(await service.start(userId, config)).toEqual(first);
    await expect(
      service.start(userId, { ...config, subtemaId: 'another' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.attempt.create).toHaveBeenCalledTimes(1);
    expect(harness.pregunta.findMany).toHaveBeenCalledTimes(1);
  });

  it('requires eight valid questions with exactly one correct option', async () => {
    harness.candidates[0].respuestas[1].esCorrecta = true;
    await expect(service.start(userId, config)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(harness.attempt.create).not.toHaveBeenCalled();
  });

  it('reveals correction only for the answered snapshot', async () => {
    const first = await service.start(userId, config);
    const id = first.pregunta!.id as string;
    const next = await service.answer(userId, first.id, submission(id, false));
    expect(next).toMatchObject({
      aciertos: 0,
      errores: 1,
      escudo: 2,
      estado: 'ACTIVO',
    });
    expect(next.revision).toHaveLength(1);
    expect(next.revision[0]).toMatchObject({
      esCorrecta: false,
      respuestaCorrectaId: `${id}-yes`,
      explicacion: `SECRET-${id}`,
    });
    expect(next.pregunta!.id).not.toBe(id);
    expect(JSON.stringify(next.pregunta)).not.toMatch(
      /SECRET|correctAnswerId|esCorrecta/,
    );
  });

  it('uses original snapshots when the published bank is edited afterwards', async () => {
    const first = await service.start(userId, config);
    const id = first.pregunta!.id as string;
    const edited = harness.candidates.find((q) => q.id === id)!;
    edited.enunciado = 'Edited later';
    edited.explicacion = 'Edited explanation';
    edited.respuestas[0].esCorrecta = false;
    edited.respuestas[1].esCorrecta = true;
    const next = await service.answer(userId, first.id, submission(id, true));
    expect(next.aciertos).toBe(1);
    expect(next.revision[0].explicacion).toBe(`SECRET-${id}`);
    expect(next.revision[0].pregunta.enunciado).toBe(`Statement ${id}`);
    expect(harness.pregunta.findMany).toHaveBeenCalledTimes(1);
  });

  it('rejects a future question or option from another question without a mutation', async () => {
    const state = await service.start(userId, config);
    const stored = harness.rows.get(state.id)!;
    const future = (stored.preguntas as any[])[1].question.id;
    await expect(
      service.answer(userId, state.id, submission(future, true)),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.answer(userId, state.id, {
        ...submission(state.pregunta!.id as string, true),
        respuestaId: `${future}-yes`,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.attempt.update).not.toHaveBeenCalled();
  });

  it('replays an identical idempotency key without consuming another shield', async () => {
    const state = await service.start(userId, config);
    const answer = submission(state.pregunta!.id as string, false);
    const first = await service.answer(userId, state.id, answer);
    expect(await service.answer(userId, state.id, answer)).toEqual(first);
    expect(harness.attempt.update).toHaveBeenCalledTimes(1);
    await expect(
      service.answer(userId, state.id, {
        ...answer,
        respuestaId: `${answer.preguntaId}-yes`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('serializes two starts for the same user before reading attempts', async () => {
    const [first, second] = await Promise.all([
      service.start(userId, config),
      service.start(userId, config),
    ]);
    expect(first.id).toBe(second.id);
    expect(harness.attempt.create).toHaveBeenCalledTimes(1);
    for (const sql of harness.locks) {
      expect(sql.values).toEqual([`guardian:${userId}`]);
      expect(sql.sql).toContain('pg_advisory_xact_lock');
      expect(sql.sql).toContain('1::int AS locked');
      expect(sql.sql).not.toContain(userId);
    }
  });

  it('accepts only one of concurrent conflicting submissions', async () => {
    const state = await service.start(userId, config);
    const id = state.pregunta!.id as string;
    const results = await Promise.allSettled([
      service.answer(userId, state.id, submission(id, false, 'key-1')),
      service.answer(userId, state.id, submission(id, true, 'key-2')),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const current = await service.get(userId, state.id);
    expect(current.revision).toHaveLength(1);
    expect(current.escudo).toBe(2);
  });

  it.each([
    ['VICTORIA', true, 6],
    ['DERROTA', false, 3],
  ] as const)(
    'ends with %s and permits idempotent retry of the terminal answer',
    async (status, correct, count) => {
      let state = await service.start(userId, config);
      let last = submission('', true);
      for (let index = 0; index < count; index++) {
        expect(state.estado).toBe('ACTIVO');
        last = submission(
          state.pregunta!.id as string,
          correct,
          `key-${index}`,
        );
        state = await service.answer(userId, state.id, last);
      }
      expect(state.estado).toBe(status);
      expect(state.pregunta).toBeNull();
      expect(state.revision).toHaveLength(count);
      expect(await service.answer(userId, state.id, last)).toEqual(state);
      await expect(
        service.answer(userId, state.id, {
          ...last,
          idempotencyKey: 'new-key',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        Number.isFinite(harness.rows.get(state.id)!.finalizadoEn!.getTime()),
      ).toBe(true);
    },
  );

  it('does not disclose or modify attempts owned by another student', async () => {
    const state = await service.start(userId, config);
    for (const action of [
      () => service.get('intruder', state.id),
      () =>
        service.answer(
          'intruder',
          state.id,
          submission(state.pregunta!.id as string, true),
        ),
      () => service.abandon('intruder', state.id),
    ])
      await expect(action()).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.attempt.update).not.toHaveBeenCalled();
  });

  it('expires at the exact deadline and ignores an answer without grading it', async () => {
    const state = await service.start(userId, config);
    harness.rows.get(state.id)!.venceEn = new Date(Date.now() - 1);
    const result = await service.answer(
      userId,
      state.id,
      submission(state.pregunta!.id as string, true),
    );
    expect(result).toMatchObject({
      estado: 'EXPIRADO',
      pregunta: null,
      revision: [],
    });
    expect(await service.active(userId)).toBeNull();
    expect(harness.attempt.update).toHaveBeenCalledTimes(1);
    const replacement = await service.start(userId, config);
    expect(replacement.id).not.toBe(state.id);
  });

  it('abandon is idempotent and never reveals questions that were not answered', async () => {
    const state = await service.start(userId, config);
    const ended = await service.abandon(userId, state.id);
    expect(ended).toMatchObject({
      estado: 'ABANDONADO',
      pregunta: null,
      revision: [],
    });
    expect(await service.abandon(userId, state.id)).toEqual(ended);
    expect(harness.attempt.update).toHaveBeenCalledTimes(1);
  });
});

function submission(
  preguntaId: string,
  correct: boolean,
  idempotencyKey = 'key-1',
) {
  return {
    preguntaId,
    respuestaId: `${preguntaId}-${correct ? 'yes' : 'no'}`,
    idempotencyKey,
  };
}

function createHarness() {
  const rows = new Map<string, IntentoGuardian>();
  const candidates = Array.from({ length: 8 }, (_, index) => {
    const id = `q${index}`;
    return {
      id,
      enunciado: `Statement ${id}`,
      imagenUrl: '/image.png',
      dificultad: Dificultad.BASICO,
      ordenEnCaso: index,
      explicacion: `SECRET-${id}`,
      respuestas: [
        { id: `${id}-yes`, texto: 'Correct choice', esCorrecta: true },
        { id: `${id}-no`, texto: 'Other choice', esCorrecta: false },
      ],
      subtema: {
        id: 'sub-1',
        nombre: 'Ratios',
        tema: { id: 'topic-1', nombre: 'Algebra', area: AreaIcfes.MATEMATICAS },
      },
      caso: {
        id: 'case-1',
        titulo: 'Case',
        contexto: 'Read this passage.',
        imagenUrl: null,
      },
    };
  });
  const usuario = {
    findUnique: jest.fn().mockResolvedValue({ rol: RolUsuario.ESTUDIANTE }),
  };
  const pregunta = {
    findMany: jest.fn(async () => structuredClone(candidates)),
  };
  const attempt = {
    findFirst: jest.fn(async ({ where }) =>
      structuredClone(
        [...rows.values()].find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
      ),
    ),
    create: jest.fn(async ({ data }) => {
      const row = {
        id: `attempt-${rows.size + 1}`,
        subtemaId: null,
        estado: 'ACTIVO',
        version: 1,
        respuestas: [],
        finalizadoEn: null,
        ...data,
      } as IntentoGuardian;
      if (row.subtemaId === undefined) row.subtemaId = null;
      rows.set(row.id, structuredClone(row));
      return structuredClone(row);
    }),
    update: jest.fn(async ({ where, data }) => {
      const row = { ...rows.get(where.id)!, ...data };
      rows.set(row.id, structuredClone(row));
      return structuredClone(row);
    }),
  };
  let lockTail = Promise.resolve();
  const locks: Prisma.Sql[] = [];
  // This harness emulates lock ordering, not PostgreSQL or real DB isolation.
  const transaction = jest.fn(async (action: (tx: any) => Promise<any>) => {
    let locked = false;
    let release: (() => void) | undefined;
    const assertLock = () => {
      if (!locked) throw new Error('Read/write before awaited lock');
    };
    const tx = {
      usuario,
      $queryRaw: async (sql: Prisma.Sql) => {
        // The production transaction now also locks/rechecks the user row.
        // Reentrant SQL within this simulated transaction must not await itself.
        if (sql.sql.includes('FOR UPDATE')) {
          assertLock();
          return [{ id: userId }];
        }
        locks.push(sql);
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        locked = true;
        return [{ locked: 1 }];
      },
      intentoGuardian: Object.fromEntries(
        Object.entries(attempt).map(([key, fn]) => [
          key,
          (...args: any[]) => {
            assertLock();
            return (fn as (...args: any[]) => unknown)(...args);
          },
        ]),
      ),
      pregunta: {
        findMany: (...args: any[]) => {
          assertLock();
          return (pregunta.findMany as (...args: any[]) => unknown)(...args);
        },
      },
    };
    try {
      return await action(tx);
    } finally {
      release?.();
    }
  });
  return {
    rows,
    candidates,
    usuario,
    pregunta,
    attempt,
    transaction,
    locks,
    prisma: { usuario, $transaction: transaction } as unknown as PrismaService,
  };
}
