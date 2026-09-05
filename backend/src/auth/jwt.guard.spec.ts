import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminGuard,
  AdministradorInstitucionGuard,
  ProfesorInstitucionGuard,
  PropietarioInstitucionGuard,
} from './jwt.guard';
import { AuthenticatedRequest } from './auth.types';

function contexto(request: Partial<AuthenticatedRequest>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('guards de roles actuales', () => {
  const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
  const usuario = { findUnique: jest.fn() };
  const miembroInstitucion = { findUnique: jest.fn() };
  const prisma = { usuario, miembroInstitucion } as unknown as PrismaService;

  beforeEach(() => jest.clearAllMocks());

  it('convierte un token inválido de admin en 401 y no en 500', async () => {
    (jwt.verifyAsync as jest.Mock).mockRejectedValue(new Error('token roto'));
    const guard = new AdminGuard(jwt, prisma);

    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: 'Bearer token-roto' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('consulta el rol actual y rechaza un admin degradado', async () => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 'usuario-1',
      correo: 'admin@example.com',
      nombre: 'Admin',
      rol: 'ADMIN',
    });
    usuario.findUnique.mockResolvedValue({
      correo: 'admin@example.com',
      nombre: 'Admin',
      rol: 'ESTUDIANTE',
      institucionId: null,
    });
    const guard = new AdminGuard(jwt, prisma);

    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: 'Bearer token-viejo' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('impide que un estudiante gestione su institución', async () => {
    usuario.findUnique.mockResolvedValue({
      correo: 'estudiante@example.com',
      nombre: 'Estudiante',
      rol: 'ESTUDIANTE',
      institucionId: 'institucion-1',
    });
    const guard = new ProfesorInstitucionGuard(prisma);

    await expect(
      guard.canActivate(
        contexto({
          usuario: {
            sub: 'usuario-1',
            correo: 'estudiante@example.com',
            nombre: 'Estudiante',
            rol: 'ESTUDIANTE',
            institucionId: 'institucion-1',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite administrar solo a propietario o administrador institucional', async () => {
    miembroInstitucion.findUnique.mockResolvedValue({
      rol: 'PROPIETARIO',
      institucionId: 'institucion-1',
    });
    const guard = new AdministradorInstitucionGuard(prisma);
    const request = {
      usuario: {
        sub: 'owner-1',
        correo: 'owner@example.com',
        nombre: 'Owner',
        rol: 'PROFESOR' as const,
        institucionId: undefined as string | undefined,
      },
    };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
    expect(request.usuario.institucionId).toBe('institucion-1');

    miembroInstitucion.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      institucionId: 'institucion-1',
    });
    await expect(guard.canActivate(contexto(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reserva la eliminación institucional para el propietario', async () => {
    miembroInstitucion.findUnique.mockResolvedValue({
      rol: 'ADMINISTRADOR',
      institucionId: 'institucion-1',
    });
    const guard = new PropietarioInstitucionGuard(prisma);

    await expect(
      guard.canActivate(
        contexto({
          usuario: {
            sub: 'admin-1',
            correo: 'admin@example.com',
            nombre: 'Admin',
            rol: 'PROFESOR',
            institucionId: 'institucion-1',
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
