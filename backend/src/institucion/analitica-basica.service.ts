import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { subtemaPublicadoWhere } from '../common/contenido-publicado';
import { progresoPublicadoCount } from './progreso-publicado';

interface EstudianteAnalitica {
  id: string;
  _count: { progresotemas: number };
  resultados: { puntaje: number; fechaRealizado: Date }[];
  progresotemas: {
    completado: boolean;
    fechaVisto: Date;
  }[];
}

@Injectable()
export class AnaliticaBasicaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly institucionAcceso: InstitucionAccesoService,
  ) {}

  async obtener(usuarioId: string) {
    const membresia =
      await this.institucionAcceso.obtenerMembresiaGestionable(usuarioId);
    const capacidades =
      await this.institucionAcceso.obtenerCapacidadesInstitucion(
        membresia.institucionId,
      );
    const periodoDias = 30;
    const desde = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000);
    const [totalSubtemas, grupos] = await Promise.all([
      this.prisma.subtema.count({ where: subtemaPublicadoWhere() }),
      this.prisma.clase.findMany({
        where: {
          institucionId: membresia.institucionId,
          ...(membresia.rol === 'PROFESOR' && {
            profesores: { some: { miembroId: membresia.id } },
          }),
        },
        orderBy: { nombre: 'asc' },
        select: {
          id: true,
          nombre: true,
          grado: true,
          ClaseEstudiante: {
            select: {
              Usuario: {
                select: {
                  id: true,
                  _count: progresoPublicadoCount,
                  resultados: {
                    where: { fechaRealizado: { gte: desde } },
                    select: { puntaje: true, fechaRealizado: true },
                  },
                  progresotemas: {
                    select: {
                      completado: true,
                      fechaVisto: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const estudiantesUnicos = new Map<string, EstudianteAnalitica>();
    const resumenGrupos = grupos.map((grupo) => {
      const estudiantes = grupo.ClaseEstudiante.map((item) => item.Usuario);
      for (const estudiante of estudiantes) {
        estudiantesUnicos.set(estudiante.id, estudiante);
      }
      return {
        id: grupo.id,
        nombre: grupo.nombre,
        grado: grupo.grado,
        ...this.calcularMetricas(estudiantes, totalSubtemas, desde),
      };
    });

    return {
      nivel: 'BASICA',
      alcance:
        membresia.rol === 'PROFESOR' ? 'GRUPOS_ASIGNADOS' : 'INSTITUCION',
      periodoDias,
      generadoEn: new Date(),
      plan: {
        nombre: capacidades.plan,
        limiteGrupos: capacidades.limiteGrupos,
        limiteEstudiantes: capacidades.limiteEstudiantes,
        publicidadHabilitada: capacidades.publicidadHabilitada,
      },
      resumen: this.calcularMetricas(
        [...estudiantesUnicos.values()],
        totalSubtemas,
        desde,
      ),
      grupos: resumenGrupos,
      privacidad: {
        incluyeIdentidades: false,
        descripcion:
          'Los indicadores básicos son agregados y no incluyen nombres ni correos.',
      },
    };
  }

  private calcularMetricas(
    estudiantes: EstudianteAnalitica[],
    totalSubtemas: number,
    desde: Date,
  ) {
    const resultados = estudiantes.flatMap((item) => item.resultados);
    const progresoIndividual = estudiantes.map((item) => {
      const completados = item._count.progresotemas;
      return totalSubtemas === 0
        ? 0
        : Math.min(100, Math.round((completados / totalSubtemas) * 100));
    });
    const fechasActividad = estudiantes.flatMap((item) => [
      ...item.resultados.map((resultado) => resultado.fechaRealizado),
      ...item.progresotemas
        .filter((progreso) => progreso.fechaVisto >= desde)
        .map((progreso) => progreso.fechaVisto),
    ]);
    const estudiantesActivos = estudiantes.filter(
      (item) =>
        item.resultados.length > 0 ||
        item.progresotemas.some((progreso) => progreso.fechaVisto >= desde),
    ).length;
    const promedioPuntaje =
      resultados.length === 0
        ? 0
        : this.redondear(
            resultados.reduce((suma, item) => suma + item.puntaje, 0) /
              resultados.length,
          );
    const progresoPromedio =
      progresoIndividual.length === 0
        ? 0
        : this.redondear(
            progresoIndividual.reduce((suma, valor) => suma + valor, 0) /
              progresoIndividual.length,
          );
    return {
      totalEstudiantes: estudiantes.length,
      estudiantesActivos,
      totalSimulacros: resultados.length,
      promedioPuntaje,
      progresoPromedio,
      ultimaActividad:
        fechasActividad.length === 0
          ? null
          : new Date(
              Math.max(...fechasActividad.map((fecha) => fecha.getTime())),
            ),
    };
  }

  private redondear(valor: number) {
    return Math.round(valor * 10) / 10;
  }
}
