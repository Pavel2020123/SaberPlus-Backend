import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import * as request from 'supertest';
import { PagosModule } from './pagos.module';

describe('Pagos heredados retirados', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Arranca sin Prisma, JWT, correo ni credenciales de una pasarela.
    const module = await Test.createTestingModule({
      imports: [PagosModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it.each([false, true])(
    'no crea órdenes, con autorización: %s',
    async (auth) => {
      const call = request(app.getHttpServer() as Server)
        .post('/pagos/crear-orden')
        .send({ codigoCupon: 'PRUEBA' });
      if (auth) call.set('Authorization', 'Bearer token-de-prueba');
      await call.expect(410).expect((response) => {
        expect(response.body).toMatchObject({
          code: 'LEGACY_PAYMENTS_RETIRED',
        });
      });
    },
  );

  it('rechaza confirmaciones repetidas sin aprobar pagos', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await request(app.getHttpServer() as Server)
        .post('/pagos/confirmacion')
        .type('form')
        .send({ x_id_invoice: 'orden-antigua', x_response: 'Aceptada' })
        .expect(410)
        .expect((response) => {
          expect(response.body).toMatchObject({
            code: 'LEGACY_PAYMENTS_RETIRED',
          });
        });
    }
  });

  it('no revela datos ni existencia de facturas históricas', async () => {
    await request(app.getHttpServer() as Server)
      .get('/pagos/estado/orden-antigua')
      .expect(410)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'LEGACY_PAYMENTS_RETIRED',
        });
        expect(response.body).not.toHaveProperty('factura');
      });
  });

  it('no importa módulos de negocio ni registra servicios de cobro', () => {
    expect(Reflect.getMetadata('imports', PagosModule) ?? []).toEqual([]);
    expect(Reflect.getMetadata('providers', PagosModule) ?? []).toEqual([]);
  });
});
