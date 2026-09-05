import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const VERSION_TUTORIAL = 1;

@Injectable()
export class TutorialService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerEstado(usuarioId: string) {
    const usuario = await this.buscarUsuario(usuarioId);
    const versionVista = this.versionVista(usuario);
    const disponible =
      usuario.rol === 'ESTUDIANTE' || usuario.rol === 'PROFESOR';

    return {
      disponible,
      pendiente: disponible && versionVista < VERSION_TUTORIAL,
      rol: usuario.rol,
      versionActual: VERSION_TUTORIAL,
      versionVista,
    };
  }

  async completar(usuarioId: string) {
    const usuario = await this.buscarUsuario(usuarioId);
    if (usuario.rol === 'ESTUDIANTE') {
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: { tutorialEstudianteVersion: VERSION_TUTORIAL },
      });
    } else if (usuario.rol === 'PROFESOR') {
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: { tutorialProfesorVersion: VERSION_TUTORIAL },
      });
    }

    return {
      completado: true,
      rol: usuario.rol,
      versionVista: VERSION_TUTORIAL,
    };
  }

  private buscarUsuario(usuarioId: string) {
    return this.prisma.usuario
      .findUnique({
        where: { id: usuarioId },
        select: {
          rol: true,
          tutorialEstudianteVersion: true,
          tutorialProfesorVersion: true,
        },
      })
      .then((usuario) => {
        if (!usuario) throw new NotFoundException('Usuario no encontrado.');
        return usuario;
      });
  }

  private versionVista(usuario: {
    rol: string | null;
    tutorialEstudianteVersion: number;
    tutorialProfesorVersion: number;
  }) {
    if (usuario.rol === 'ESTUDIANTE') {
      return usuario.tutorialEstudianteVersion;
    }
    if (usuario.rol === 'PROFESOR') return usuario.tutorialProfesorVersion;
    return VERSION_TUTORIAL;
  }
}
