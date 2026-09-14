import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LearningEvidenceService } from '../diagnostico/learning-evidence.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

@Injectable()
export class StudentEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: InstitucionAccesoService,
    private readonly evidence: LearningEvidenceService,
  ) {}

  // Alcance compartido por evidencia P2 y evolución P4, sin consultar respuestas.
  async estudianteAutorizado(actorId: string, estudianteId: string) {
    const miembro = await this.acceso.obtenerMembresiaGestionable(actorId);
    if (!['PROFESOR', 'ADMINISTRADOR', 'PROPIETARIO'].includes(miembro.rol)) {
      throw new ForbiddenException('No tienes acceso docente.');
    }
    const plan = await this.acceso.obtenerCapacidadesInstitucion(
      miembro.institucionId,
    );
    if (plan.nivelAnalitica !== 'DETALLADA') {
      throw new ForbiddenException(
        'El seguimiento individual requiere analítica detallada.',
      );
    }
    const grupoWhere = {
      institucionId: miembro.institucionId,
      ...(miembro.rol === 'PROFESOR' && {
        profesores: { some: { miembroId: miembro.id } },
      }),
    };
    const estudiante = await this.prisma.usuario.findFirst({
      where: {
        id: estudianteId,
        rol: 'ESTUDIANTE',
        institucionId: miembro.institucionId,
        ...(miembro.rol === 'PROFESOR' && {
          ClaseEstudiante: { some: { Clase: grupoWhere } },
        }),
      },
      select: {
        id: true,
        nombre: true,
        ClaseEstudiante: {
          where: { Clase: grupoWhere },
          select: { Clase: { select: { id: true, nombre: true } } },
        },
      },
    });
    // La misma respuesta para un ID inexistente o fuera del alcance.
    if (!estudiante)
      throw new NotFoundException('Estudiante no disponible en tu alcance.');
    return estudiante;
  }

  async obtener(actorId: string, estudianteId: string) {
    await this.estudianteAutorizado(actorId, estudianteId);
    const evidencia = await this.evidence.obtener(estudianteId);
    // Si se retira al docente, cambia el grupo o vence el plan durante la lectura,
    // no entregar la respuesta usando únicamente la autorización inicial.
    const estudiante = await this.estudianteAutorizado(actorId, estudianteId);
    return {
      version: 1,
      estudiante: {
        id: estudiante.id,
        nombre: estudiante.nombre,
        grupos: estudiante.ClaseEstudiante.map((item) => item.Clase),
      },
      evidencia,
    };
  }
}
