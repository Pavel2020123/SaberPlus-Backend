import { Server } from 'node:http';
import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminGuard, JwtGuard } from './jwt.guard';

@Controller('protected-probe')
class ProtectedProbe {
  @Get()
  @UseGuards(JwtGuard)
  read() {
    return { ok: true };
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  admin() {
    return { ok: true };
  }
}

describe('contraseña inicial: autorización HTTP real con DB/firma simuladas', () => {
  let app: INestApplication<Server>;
  let pending: boolean;
  let role: string;
  const updateProfile = jest.fn();
  const findUnique = jest.fn(() =>
    Promise.resolve({
      nombre: 'Titular',
      correo: 'titular@example.invalid',
      rol: role,
      debeCambiarContrasena: pending,
    }),
  );

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController, ProtectedProbe],
      providers: [
        JwtGuard,
        AdminGuard,
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn().mockResolvedValue({
              sub: 'titular',
              debeCambiarContrasena: false,
            }),
          },
        },
        { provide: PrismaService, useValue: { usuario: { findUnique } } },
        {
          provide: AuthService,
          useValue: {
            obtenerPerfil: () => ({ debeCambiarContrasena: pending }),
            actualizarPerfil: updateProfile,
            cambiarContrasenaInicial: () => {
              pending = false;
              return { ok: true };
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    await app.init();
  });

  beforeEach(() => {
    pending = true;
    role = 'ESTUDIANTE';
    jest.clearAllMocks();
  });
  afterAll(() => app.close());

  it('rechaza acceso directo aunque el JWT afirme que no hay cambio pendiente', async () => {
    await request(app.getHttpServer())
      .get('/protected-probe')
      .set('Authorization', 'Bearer valid')
      .expect(403);
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining<Record<string, unknown>>({
        select: expect.objectContaining<Record<string, unknown>>({
          debeCambiarContrasena: true,
        }),
      }),
    );
  });

  it('la excepción GET perfil no habilita PATCH perfil ni otros endpoints', async () => {
    await request(app.getHttpServer())
      .get('/auth/perfil')
      .set('Authorization', 'Bearer valid')
      .expect(200);
    await request(app.getHttpServer())
      .patch('/auth/perfil')
      .set('Authorization', 'Bearer valid')
      .send({ descripcion: 'bypass' })
      .expect(403);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('permite cambiar la contraseña y reevalúa la DB con el mismo token', async () => {
    await request(app.getHttpServer())
      .patch('/auth/cambiar-contrasena-inicial')
      .set('Authorization', 'Bearer valid')
      .send({ nuevaContrasena: 'NuevaClave123!' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/protected-probe')
      .set('Authorization', 'Bearer valid')
      .expect(200);
  });

  it('no permite usar las excepciones sin token', async () => {
    await request(app.getHttpServer()).get('/auth/perfil').expect(401);
    await request(app.getHttpServer())
      .patch('/auth/cambiar-contrasena-inicial')
      .send({ nuevaContrasena: 'NuevaClave123!' })
      .expect(401);
  });

  it('bloquea ADMIN directo y permite la cuenta normal después del cambio', async () => {
    role = 'ADMIN';
    await request(app.getHttpServer())
      .get('/protected-probe/admin')
      .set('Authorization', 'Bearer valid')
      .expect(403);
    pending = false;
    await request(app.getHttpServer())
      .get('/protected-probe/admin')
      .set('Authorization', 'Bearer valid')
      .expect(200);
  });
});
