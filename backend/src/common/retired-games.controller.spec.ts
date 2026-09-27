import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { Server } from 'node:http';
import { RetiredGamesController } from './retired-games.controller';

describe('Retired games', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RetiredGamesController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it.each([
    '/escudo-conocimiento/intentos',
    '/escudo-conocimiento/intentos/activo',
    '/escudo-conocimiento/intentos/old-id',
    '/escudo-conocimiento/intentos/old-id/respuestas',
    '/escudo-conocimiento/intentos/old-id/abandonar',
  ])('returns 410 without any database or game service: %s', async (path) => {
    const server = app.getHttpServer() as Server;
    const get = await request(server).get(path).expect(410);
    expect(get.body).toEqual(
      expect.objectContaining({ codigo: 'JUEGO_RETIRADO' }),
    );
    const post = await request(server)
      .post(path)
      .send({ respuestaId: 'anything' })
      .expect(410);
    expect(post.body).toEqual(
      expect.objectContaining({ codigo: 'JUEGO_RETIRADO' }),
    );
  });
});
