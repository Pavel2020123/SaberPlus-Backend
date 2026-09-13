import { ForbiddenException, Injectable } from '@nestjs/common';
import { AreaIcfes } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { subtemaPublicadoWhere } from '../common/contenido-publicado';
import { progresoPublicadoCount } from './progreso-publicado';

export interface AnaliticaAreaEstudiante {
  area: AreaIcfes;
  promedio: number;
  cantidad: number;
}

export interface AnaliticaEstudianteDetallada {
  id: string;
  nombre: string;
  correo: string;
  xpTotal: number;
  grupos: { id: string; nombre: string }[];
  totalSimulacros: number;
  promedioPuntaje: number;
  ultimoSimulacro: Date | null;
  ultimaActividad: Date | null;
  temasCompletados: number;
  totalSubtemas: number;
  progresoPorcentaje: number;
  porArea: AnaliticaAreaEstudiante[];
  areaPrioritaria: AreaIcfes | null;
  estadoAcademico: 'REFUERZO' | 'ATENCION' | 'ESTABLE' | 'SIN_DATOS';
}

@Injectable()
export class AnaliticaDetalladaService {
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
    if (capacidades.nivelAnalitica !== 'DETALLADA') {
      throw new ForbiddenException(
        'Tu plan incluye los indicadores básicos, no la analítica detallada.',
      );
    }

    const soloGruposAsignados = membresia.rol === 'PROFESOR';
    const [totalSubtemas, estudiantes] = await Promise.all([
      this.prisma.subtema.count({ where: subtemaPublicadoWhere() }),
      this.prisma.usuario.findMany({
        where: {
          institucionId: membresia.institucionId,
          rol: 'ESTUDIANTE',
          ...(soloGruposAsignados && {
            ClaseEstudiante: {
              some: {
                Clase: {
                  profesores: { some: { miembroId: membresia.id } },
                },
              },
            },
          }),
        },
        select: {
          id: true,
          _count: progresoPublicadoCount,
          nombre: true,
          correo: true,
          xpTotal: true,
          ClaseEstudiante: {
            where: soloGruposAsignados
              ? {
                  Clase: {
                    profesores: { some: { miembroId: membresia.id } },
                  },
                }
              : undefined,
            select: { Clase: { select: { id: true, nombre: true } } },
          },
          resultados: {
            select: { area: true, puntaje: true, fechaRealizado: true },
          },
          progresotemas: {
            select: { completado: true, fechaVisto: true },
          },
          diagnosticoInicial: {
            select: {
              resultadosPorArea: {
                select: { area: true, porcentaje: true },
              },
            },
          },
        },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    const resumenEstudiantes: AnaliticaEstudianteDetallada[] = estudiantes.map(
      (estudiante) => {
        const totalSimulacros = estudiante.resultados.length;
        const promedioPuntaje = this.promedio(
          estudiante.resultados.map((resultado) => resultado.puntaje),
        );
        const fechasSimulacro = estudiante.resultados.map(
          (resultado) => resultado.fechaRealizado,
        );
        const ultimoSimulacro = this.fechaMayor(fechasSimulacro);
        const temasCompletados = estudiante._count.progresotemas;
        const progresoPorcentaje =
          totalSubtemas === 0
            ? 0
            : Math.min(
                100,
                Math.round((temasCompletados / totalSubtemas) * 100),
              );

        const areas = new Map<AreaIcfes, { suma: number; cantidad: number }>();
        for (const resultado of estudiante.resultados) {
          const actual = areas.get(resultado.area) ?? {
            suma: 0,
            cantidad: 0,
          };
          actual.suma += resultado.puntaje;
          actual.cantidad += 1;
          areas.set(resultado.area, actual);
        }
        const porArea = [...areas.entries()]
          .map(([area, valores]) => ({
            area,
            promedio: this.redondear(valores.suma / valores.cantidad),
            cantidad: valores.cantidad,
          }))
          .sort((a, b) => a.promedio - b.promedio);
        const areaPrioritaria =
          porArea[0]?.area ??
          estudiante.diagnosticoInicial?.resultadosPorArea
            .slice()
            .sort((a, b) => a.porcentaje - b.porcentaje)[0]?.area ??
          null;
        const ultimaActividad = this.fechaMayor([
          ...fechasSimulacro,
          ...estudiante.progresotemas.map((progreso) => progreso.fechaVisto),
        ]);

        return {
          id: estudiante.id,
          nombre: estudiante.nombre,
          correo: estudiante.correo,
          xpTotal: estudiante.xpTotal ?? 0,
          grupos: estudiante.ClaseEstudiante.map((item) => item.Clase),
          totalSimulacros,
          promedioPuntaje,
          ultimoSimulacro,
          ultimaActividad,
          temasCompletados,
          totalSubtemas,
          progresoPorcentaje,
          porArea,
          areaPrioritaria,
          estadoAcademico: this.estadoAcademico(
            totalSimulacros,
            promedioPuntaje,
          ),
        };
      },
    );

    const prioridades = this.calcularPrioridades(resumenEstudiantes);
    const conSimulacros = resumenEstudiantes.filter(
      (estudiante) => estudiante.totalSimulacros > 0,
    );
    return {
      nivel: 'DETALLADA',
      alcance: soloGruposAsignados ? 'GRUPOS_ASIGNADOS' : 'INSTITUCION',
      generadoEn: new Date(),
      plan: {
        nombre: capacidades.plan,
        limiteGrupos: capacidades.limiteGrupos,
        limiteEstudiantes: capacidades.limiteEstudiantes,
        publicidadHabilitada: capacidades.publicidadHabilitada,
        venceEn: capacidades.venceEn,
      },
      institucion: {
        totalEstudiantes: resumenEstudiantes.length,
        promedioGeneral: this.promedio(
          conSimulacros.map((estudiante) => estudiante.promedioPuntaje),
        ),
        totalSimulacros: resumenEstudiantes.reduce(
          (total, estudiante) => total + estudiante.totalSimulacros,
          0,
        ),
        estudiantesPorReforzar: resumenEstudiantes.filter(
          (estudiante) => estudiante.estadoAcademico === 'REFUERZO',
        ).length,
      },
      prioridades,
      estudiantes: resumenEstudiantes,
    };
  }

  private calcularPrioridades(estudiantes: AnaliticaEstudianteDetallada[]) {
    const agrupadas = new Map<
      AreaIcfes,
      { estudiantes: number; sumaPromedios: number; conPromedio: number }
    >();
    for (const estudiante of estudiantes) {
      if (!estudiante.areaPrioritaria) continue;
      const actual = agrupadas.get(estudiante.areaPrioritaria) ?? {
        estudiantes: 0,
        sumaPromedios: 0,
        conPromedio: 0,
      };
      actual.estudiantes += 1;
      const resultadoArea = estudiante.porArea.find(
        (area) => area.area === estudiante.areaPrioritaria,
      );
      if (resultadoArea) {
        actual.sumaPromedios += resultadoArea.promedio;
        actual.conPromedio += 1;
      }
      agrupadas.set(estudiante.areaPrioritaria, actual);
    }
    return [...agrupadas.entries()]
      .map(([area, valores]) => ({
        area,
        estudiantes: valores.estudiantes,
        promedio: valores.conPromedio
          ? this.redondear(valores.sumaPromedios / valores.conPromedio)
          : null,
      }))
      .sort(
        (a, b) =>
          b.estudiantes - a.estudiantes ||
          (a.promedio ?? 101) - (b.promedio ?? 101),
      );
  }

  private estadoAcademico(
    totalSimulacros: number,
    promedio: number,
  ): AnaliticaEstudianteDetallada['estadoAcademico'] {
    if (totalSimulacros === 0) return 'SIN_DATOS';
    if (promedio < 50) return 'REFUERZO';
    if (promedio < 65) return 'ATENCION';
    return 'ESTABLE';
  }

  private promedio(valores: number[]) {
    return valores.length === 0
      ? 0
      : this.redondear(
          valores.reduce((total, valor) => total + valor, 0) / valores.length,
        );
  }

  private redondear(valor: number) {
    return Math.round(valor * 10) / 10;
  }

  private fechaMayor(fechas: Date[]) {
    return fechas.length === 0
      ? null
      : new Date(Math.max(...fechas.map((fecha) => fecha.getTime())));
  }
}
