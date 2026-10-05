import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { JuegoCompetitivo, RolUsuario } from '@prisma/client';
import * as request from 'supertest';
import { Server } from 'node:http';
import { PrismaService } from '../prisma/prisma.service';
import { RankingModule } from './ranking.module';
import { CompetitiveRankingReader } from './competitive-ranking.reader';
import {
  CompetitiveRankingContractError,
  projectCompetitiveRanking,
} from './competitive-ranking.contract';

const id = (n: number) =>
  `abcdefab-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = id(51);
const path = '/ranking/competitivo?juego=TRIVIA_RUSH&temporada=2026';
describe('competitive ranking real HTTP/JWT boundary', () => {
  let app: INestApplication, jwt: JwtService;
  const read = jest.fn();
  const users = new Map<string, any>();
  const raw = jest.fn();
  const prisma = {
    usuario: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(users.get(where.id) ?? null),
      ),
      findMany: jest.fn(),
    },
    $queryRaw: raw,
  };
  const originalSecret = process.env.RANKING_ALIAS_SECRET;
  beforeAll(async () => {
    process.env.RANKING_ALIAS_SECRET = 'isolated-http-ranking-secret';
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          global: true,
          secret: 'isolated-http-jwt-secret',
          verifyOptions: { algorithms: ['HS256'] },
        }),
        RankingModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(CompetitiveRankingReader)
      .useValue({ read })
      .compile();
    expect(module.get(PrismaService)).toBe(prisma);
    jwt = module.get(JwtService);
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    if (originalSecret === undefined) delete process.env.RANKING_ALIAS_SECRET;
    else process.env.RANKING_ALIAS_SECRET = originalSecret;
  });
  beforeEach(() => {
    jest.clearAllMocks();
    users.clear();
    for (const [n, rol] of [
      [51, RolUsuario.ESTUDIANTE],
      [71, RolUsuario.PROFESOR],
      [72, RolUsuario.ADMIN],
    ] as const)
      users.set(id(n), {
        nombre: 'PRIVATE_NAME',
        correo: 'PRIVATE_EMAIL',
        rol,
        institucionId: null,
        correoVerificado: true,
        debeCambiarContrasena: false,
      });
    read.mockImplementation(async (q, own) =>
      projectCompetitiveRanking(
        q,
        Array.from({ length: 60 }, (_, i) => ({
          usuarioId: id(i + 1),
          rol: RolUsuario.ESTUDIANTE,
          gameId: JuegoCompetitivo.TRIVIA_RUSH,
          temporada: 2026,
          xp: 1000 - i,
          alcanzadoEn: new Date('2026-01-01T12:00:00Z'),
          updatedAt: new Date('2026-01-02T12:00:00Z'),
        })),
        own,
      ),
    );
    prisma.usuario.findMany.mockResolvedValue([
      { id: actor, xpTotal: 100 },
      { id: id(1), xpTotal: 200 },
    ]);
  });
  const http = () => request(app.getHttpServer() as Server);
  const token = (sub = actor) =>
    jwt.sign({ sub, rol: 'ESTUDIANTE' }, { expiresIn: '1h' });
  it('requires a verified JWT and does not query the reader anonymously', async () => {
    await http().get(path).expect(401);
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['malformed', 'wrong-signature', 'expired', 'not-before'])(
    'rejects %s token',
    async (kind) => {
      const jwtValue =
        kind === 'malformed'
          ? 'not-a-jwt'
          : kind === 'wrong-signature'
            ? new JwtService({ secret: 'wrong-test-secret' }).sign({
                sub: actor,
              })
            : kind === 'expired'
              ? jwt.sign({ sub: actor }, { expiresIn: -10 })
              : jwt.sign({ sub: actor }, { notBefore: '1h' });
      await http()
        .get(path)
        .set('Authorization', `Bearer ${jwtValue}`)
        .expect(401);
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each([71, 72])(
    'forbids current non-student %s even when signed role claims student',
    async (n) => {
      await http()
        .get(path)
        .set('Authorization', `Bearer ${token(id(n))}`)
        .expect(403);
      expect(read).not.toHaveBeenCalled();
    },
  );
  it('uses current student role rather than an old ADMIN claim', async () => {
    await http()
      .get(path)
      .set(
        'Authorization',
        `Bearer ${jwt.sign({ sub: actor, rol: 'ADMIN' }, { expiresIn: '1h' })}`,
      )
      .expect(200);
  });
  it('preserves email and initial-password guards', async () => {
    users.get(actor).correoVerificado = false;
    await http()
      .get(path)
      .set('Authorization', `Bearer ${token()}`)
      .expect(403);
    users.get(actor).correoVerificado = true;
    users.get(actor).debeCambiarContrasena = true;
    await http()
      .get(path)
      .set('Authorization', `Bearer ${token()}`)
      .expect(403);
    expect(read).not.toHaveBeenCalled();
  });
  it('passes only validated selection and verified subject; TOP 50/own position 51 and private cache', async () => {
    const response = await http()
      .get(path)
      .set('Authorization', `Bearer ${token()}`)
      .set('X-User-Id', id(1))
      .set('X-Target-User-Id', id(1))
      .expect(200);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(
      { juego: 'TRIVIA_RUSH', temporada: 2026 },
      actor,
    );
    expect(response.body.ranking).toHaveLength(50);
    expect(response.body.totalParticipantes).toBe(60);
    expect(response.body.miPosicion).toEqual({
      posicion: 51,
      alias: 'Tú',
      xp: 950,
      esUsuarioActual: true,
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Authorization');
    expect(Object.keys(response.body).sort()).toEqual([
      'estado',
      'juego',
      'limite',
      'miPosicion',
      'ranking',
      'temporada',
      'totalParticipantes',
    ]);
    for (const entry of [...response.body.ranking, response.body.miPosicion])
      expect(Object.keys(entry).sort()).toEqual([
        'alias',
        'esUsuarioActual',
        'posicion',
        'xp',
      ]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /PRIVATE_|abcdefab|usuarioId|alcanzadoEn|correo|institucion/,
    );
    expect(raw).not.toHaveBeenCalled();
  });
  it.each(['MEMORY_MATCH', 'BATTLES', 'SUMMIT'])(
    'returns contractual state for %s with HTTP 200',
    async (juego) => {
      const response = await http()
        .get(`/ranking/competitivo?juego=${juego}&temporada=2026`)
        .set('Authorization', `Bearer ${token()}`)
        .expect(200);
      expect(response.body.estado).toBe(
        juego === 'SUMMIT' ? 'SIN_PARTICIPANTES' : 'NO_DISPONIBLE',
      );
      expect(response.body.totalParticipantes).toBe(
        juego === 'SUMMIT' ? 0 : null,
      );
    },
  );
  it.each([
    '',
    'juego=trivia_rush&temporada=2026',
    'juego=TRIVIA_RUSH',
    'juego=TRIVIA_RUSH&temporada=0',
    'juego=TRIVIA_RUSH&temporada=10000',
    'juego=TRIVIA_RUSH&temporada=2e3',
    'juego=TRIVIA_RUSH&temporada=2026.0',
    'juego=TRIVIA_RUSH&temporada=02026',
    'juego=TRIVIA_RUSH&temporada=2026&temporada=2027',
    'juego=TRIVIA_RUSH&juego=SUMMIT&temporada=2026',
  ])('rejects malformed parameters %s', async (query) => {
    await http()
      .get(`/ranking/competitivo?${query}`)
      .set('Authorization', `Bearer ${token()}`)
      .expect(400);
    expect(read).not.toHaveBeenCalled();
  });
  it.each(['usuarioId', 'userId', 'targetUserId', 'participantId', 'limite'])(
    'rejects query selector/unsupported parameter %s',
    async (key) => {
      await http()
        .get(`${path}&${key}=${id(1)}`)
        .set('Authorization', `Bearer ${token()}`)
        .expect(400);
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each(['usuarioId', 'targetUserId', 'participantId'])(
    'rejects body selector %s',
    async (key) => {
      await http()
        .get(path)
        .set('Authorization', `Bearer ${token()}`)
        .send({ [key]: id(1) })
        .expect(400);
      expect(read).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['POSITIVE_BALANCE_INVALID_REACHED_AT', 500],
    ['COMPETITIVE_RANKING_COUNT_UNREPRESENTABLE', 500],
    ['INVALID_COMPETITIVE_PARTICIPANT', 500],
    ['COMPETITIVE_RANKING_READ_FAILED', 503],
    ['UNEXPECTED_PRIVATE_SQL', 500],
  ] as const)('maps server error %s safely', async (code, status) => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      read.mockRejectedValue(
        code === 'UNEXPECTED_PRIVATE_SQL'
          ? new Error(`SELECT PRIVATE_PASSWORD ${actor}`)
          : new CompetitiveRankingContractError(code),
      );
      const response = await http()
        .get(path)
        .set('Authorization', `Bearer ${token()}`)
        .expect(status);
      expect(response.body.code).toBe('COMPETITIVE_RANKING_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toMatch(
        /abcdefab|PRIVATE_|SELECT|REACHED_AT|Prisma/,
      );
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /abcdefab|PRIVATE_|SELECT/,
      );
    } finally {
      log.mockRestore();
    }
  });
  it('keeps legacy route response, role policy and general XP unchanged', async () => {
    const response = await http()
      .get('/ranking?alcance=GLOBAL&periodo=TOTAL&limite=50')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200);
    expect(response.body).toMatchObject({
      alcance: 'GLOBAL',
      periodo: 'TOTAL',
      totalParticipantes: 2,
      miPosicion: { posicion: 2, alias: 'Tú', xp: 100 },
    });
    expect(read).not.toHaveBeenCalled();
    expect(raw).not.toHaveBeenCalled();
  });
});
