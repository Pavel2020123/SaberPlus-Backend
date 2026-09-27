import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard, JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  AdminLearningMapController,
  LearningMapController,
} from './learning-map.controller';
import { MapSubtopicDto, ReplaceLearningBasesDto } from './learning-map.dto';
import {
  ancestorOrder,
  MAX_MAP_EDGES,
  orderedNodes,
} from './learning-map.graph';

const edge = (previoId: string, destinoId: string) => ({ previoId, destinoId });
describe('Learning map rules', () => {
  it('keeps prerequisite order, shared ancestors once, and unrelated nodes out', () => {
    expect(
      ancestorOrder('d', [
        edge('a', 'b'),
        edge('a', 'c'),
        edge('b', 'd'),
        edge('c', 'd'),
        edge('x', 'y'),
      ]),
    ).toEqual(['a', 'b', 'c']);
    expect(ancestorOrder('x', [])).toEqual([]);
  });
  it.each([
    [edge('a', 'a')],
    [edge('a', 'b'), edge('a', 'b')],
    [edge('a', 'b'), edge('b', 'a')],
    [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
    [edge('', 'b')],
    Array.from({ length: 9 }, (_, i) => edge(`p${i}`, 't')),
  ])('rejects invalid graph %#', (...edges) => {
    expect(() => orderedNodes(edges)).toThrow();
  });
  it('accepts a long bounded chain without recursion and rejects overflow', () => {
    const chain = Array.from({ length: MAX_MAP_EDGES }, (_, i) =>
      edge(`${i}`, `${i + 1}`),
    );
    expect(ancestorOrder(`${MAX_MAP_EDGES}`, chain)).toHaveLength(
      MAX_MAP_EDGES,
    );
    expect(() => orderedNodes([...chain, edge('extra', 'end')])).toThrow();
  });
  it('protects writes with ADMIN and learner reads with authentication and email verification', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminLearningMapController),
    ).toEqual([AdminGuard]);
    expect(Reflect.getMetadata(GUARDS_METADATA, LearningMapController)).toEqual(
      [JwtGuard, EmailVerificadoGuard],
    );
  });
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it.each([
    { revision: -1, previos: [] },
    { revision: 0.5, previos: [] },
    { revision: '0', previos: [] },
    { revision: 0, previos: ['a', 'a'] },
    { revision: 0, previos: [' '] },
    { revision: 0, previos: Array.from({ length: 9 }, (_, i) => `p${i}`) },
    { revision: 0, previos: [], usuarioId: 'forged' },
    { revision: 0, previos: null },
  ])('validates revision and bounded unique IDs: %j', async (body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: ReplaceLearningBasesDto }),
    ).rejects.toThrow();
  });
  it('accepts clearing bases and rejects malformed target IDs', async () => {
    expect(
      await pipe.transform(
        { revision: 0, previos: [] },
        { type: 'body', metatype: ReplaceLearningBasesDto },
      ),
    ).toEqual({ revision: 0, previos: [] });
    await expect(
      pipe.transform(
        { id: '../secret' },
        { type: 'param', metatype: MapSubtopicDto },
      ),
    ).rejects.toThrow();
  });
});
