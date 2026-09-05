import { ForbiddenException, Injectable } from '@nestjs/common';
import { AreaIcfes, OrigenRespuesta } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

export type NivelRiesgo = 'CRITICA' | 'ALTA' | 'ATENCION';

export interface RazonRiesgo {
  codigo:
    | 'INACTIVIDAD'
    | 'DIAGNOSTICO_PENDIENTE'
    | 'DIAGNOSTICO_BAJO'
    | 'RENDIMIENTO_RECIENTE';
  nivel: NivelRiesgo;
  titulo: string;
  detalle: string;
}

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_VENTANA_RENDIMIENTO = 30;
const MINIMO_RESPUESTAS_RENDIMIENTO = 5;

const PRIORIDAD_NIVEL: Record<NivelRiesgo, number> = {
  CRITICA: 3,
  ALTA: 2,
  ATENCION: 1,
};

@Injectable()
export class AlertasRiesgoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly institucionAcceso: InstitucionAccesoService,
  ) {}

  private nivelPorPorcentaje(porcentaje: number): NivelRiesgo | null {
    if (porcentaje < 35) return 'CRITICA';
    if (porcentaje < 50) return 'ALTA';
    if (porcentaje < 65) return 'ATENCION';
    return null;
  }

  private nivelPorInactividad(dias: number): NivelRiesgo | null {
    if (dias >= 14) return 'CRITICA';
    if (dias >= 7) return 'ALTA';
    if (dias >= 3) return 'ATENCION';
    return null;
  }

  private mayorNivel(razones: RazonRiesgo[]): NivelRiesgo {
    return razones.reduce<NivelRiesgo>(
      (mayor, razon) =>
        PRIORIDAD_NIVEL[razon.nivel] > PRIORIDAD_NIVEL[mayor]
          ? razon.nivel
          : mayor,
      'ATENCION',
    );
  }

  private diasDesde(fecha: Date, ahora: Date) {
    return Math.max(
      0,
      Math.floor((ahora.getTime() - fecha.getTime()) / DIA_MS),
    );
  }

  async obtenerAlertas(usuarioId: string) {
    const membresia =
      await this.institucionAcceso.obtenerMembresiaGestionable(usuarioId);
    const capacidades =
      await this.institucionAcceso.obtenerCapacidadesInstitucion(
        membresia.institucionId,
      );
    if (!capacidades.alertasHabilitadas) {
      throw new ForbiddenException(
        'Las alertas de riesgo requieren el plan institucional sin anuncios.',
      );
    }

    const ahora = new Date();
    const desdeRendimiento = new Date(
      ahora.getTime() - DIAS_VENTANA_RENDIMIENTO * DIA_MS,
    );
    const [totalSubtemas, estudiantes] = await Promise.all([
      this.prisma.subtema.count(),
      this.prisma.usuario.findMany({
        where: {
          institucionId: membresia.institucionId,
          rol: 'ESTUDIANTE',
          ...(membresia.rol === 'PROFESOR' && {
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
          nombre: true,
          correo: true,
          fechaCreacion: true,
          ClaseEstudiante: {
            where:
              membresia.rol === 'PROFESOR'
                ? {
                    Clase: {
                      profesores: { some: { miembroId: membresia.id } },
                    },
                  }
                : undefined,
            select: { Clase: { select: { id: true, nombre: true } } },
          },
          diagnosticoInicial: {
            select: {
              completadoEn: true,
              porcentaje: true,
              nivel: true,
              resultadosPorArea: {
                select: { area: true, porcentaje: true },
              },
            },
          },
          historialRespuestas: {
            select: { fechaRespuesta: true },
            orderBy: { fechaRespuesta: 'desc' },
            take: 1,
          },
          resultados: {
            select: { fechaRealizado: true },
            orderBy: { fechaRealizado: 'desc' },
            take: 1,
          },
          progresotemas: {
            select: { completado: true, fechaVisto: true },
          },
        },
        orderBy: { nombre: 'asc' },
      }),
    ]);

    const estudianteIds = estudiantes.map((estudiante) => estudiante.id);
    const rendimientoAgrupado =
      estudianteIds.length === 0
        ? []
        : await this.prisma.historialRespuesta.groupBy({
            by: ['usuarioId', 'area', 'esCorrecta'],
            where: {
              usuarioId: { in: estudianteIds },
              fechaRespuesta: { gte: desdeRendimiento },
              origen: { not: OrigenRespuesta.DIAGNOSTICO },
            },
            _count: { _all: true },
          });

    const rendimientoPorEstudiante = new Map<
      string,
      Map<AreaIcfes, { total: number; correctas: number }>
    >();
    for (const grupo of rendimientoAgrupado) {
      const porArea =
        rendimientoPorEstudiante.get(grupo.usuarioId) ??
        new Map<AreaIcfes, { total: number; correctas: number }>();
      const resumen = porArea.get(grupo.area) ?? { total: 0, correctas: 0 };
      resumen.total += grupo._count._all;
      if (grupo.esCorrecta) resumen.correctas += grupo._count._all;
      porArea.set(grupo.area, resumen);
      rendimientoPorEstudiante.set(grupo.usuarioId, porArea);
    }

    const alertas = estudiantes.flatMap((estudiante) => {
      const razones: RazonRiesgo[] = [];
      const fechaCreacion = estudiante.fechaCreacion ?? ahora;
      const fechasActividad = [
        estudiante.historialRespuestas[0]?.fechaRespuesta,
        estudiante.resultados[0]?.fechaRealizado,
        estudiante.diagnosticoInicial?.completadoEn,
        ...estudiante.progresotemas.map((progreso) => progreso.fechaVisto),
      ].filter((fecha): fecha is Date => fecha instanceof Date);
      const ultimaActividad =
        fechasActividad.length > 0
          ? new Date(
              Math.max(...fechasActividad.map((fecha) => fecha.getTime())),
            )
          : null;
      const diasSinActividad = this.diasDesde(
        ultimaActividad ?? fechaCreacion,
        ahora,
      );
      const nivelInactividad = this.nivelPorInactividad(diasSinActividad);
      if (nivelInactividad) {
        razones.push({
          codigo: 'INACTIVIDAD',
          nivel: nivelInactividad,
          titulo: ultimaActividad
            ? 'Actividad interrumpida'
            : 'Sin actividad registrada',
          detalle: `${diasSinActividad} días sin estudiar ni responder preguntas.`,
        });
      }

      const diagnostico = estudiante.diagnosticoInicial;
      const edadCuentaDias = this.diasDesde(fechaCreacion, ahora);
      if (!diagnostico?.completadoEn && edadCuentaDias >= 3) {
        razones.push({
          codigo: 'DIAGNOSTICO_PENDIENTE',
          nivel: 'ATENCION',
          titulo: 'Diagnóstico inicial pendiente',
          detalle: 'Aún no existe una línea base de las cinco áreas.',
        });
      }
      if (diagnostico?.completadoEn && diagnostico.porcentaje !== null) {
        const nivelDiagnostico = this.nivelPorPorcentaje(
          diagnostico.porcentaje ?? 0,
        );
        if (nivelDiagnostico && diagnostico.porcentaje < 50) {
          razones.push({
            codigo: 'DIAGNOSTICO_BAJO',
            nivel: nivelDiagnostico,
            titulo: 'Resultado inicial bajo',
            detalle: `${diagnostico.porcentaje}% de aciertos en el diagnóstico.`,
          });
        }
      }

      const porArea = rendimientoPorEstudiante.get(estudiante.id);
      const resumenReciente = [...(porArea?.values() ?? [])].reduce(
        (acumulado, area) => ({
          total: acumulado.total + area.total,
          correctas: acumulado.correctas + area.correctas,
        }),
        { total: 0, correctas: 0 },
      );
      const porcentajeReciente =
        resumenReciente.total > 0
          ? Math.round(
              (resumenReciente.correctas / resumenReciente.total) * 1000,
            ) / 10
          : null;
      if (
        porcentajeReciente !== null &&
        resumenReciente.total >= MINIMO_RESPUESTAS_RENDIMIENTO
      ) {
        const nivelRendimiento = this.nivelPorPorcentaje(porcentajeReciente);
        if (nivelRendimiento) {
          razones.push({
            codigo: 'RENDIMIENTO_RECIENTE',
            nivel: nivelRendimiento,
            titulo: 'Bajo rendimiento reciente',
            detalle: `${porcentajeReciente}% de aciertos en ${resumenReciente.total} respuestas de los últimos 30 días.`,
          });
        }
      }

      if (razones.length === 0) return [];

      const prioridadDiagnostico = diagnostico?.resultadosPorArea
        .slice()
        .sort((a, b) => a.porcentaje - b.porcentaje)[0]?.area;
      const prioridadReciente = [...(porArea?.entries() ?? [])]
        .filter(([, resumen]) => resumen.total >= 2)
        .map(([area, resumen]) => ({
          area,
          porcentaje: (resumen.correctas / resumen.total) * 100,
        }))
        .sort((a, b) => a.porcentaje - b.porcentaje)[0]?.area;
      const temasCompletados = estudiante.progresotemas.filter(
        (progreso) => progreso.completado,
      ).length;

      return [
        {
          estudiante: {
            id: estudiante.id,
            nombre: estudiante.nombre,
            correo: estudiante.correo,
            grupos: estudiante.ClaseEstudiante.map((item) => ({
              id: item.Clase.id,
              nombre: item.Clase.nombre,
            })),
          },
          nivel: this.mayorNivel(razones),
          razones: razones.sort(
            (a, b) => PRIORIDAD_NIVEL[b.nivel] - PRIORIDAD_NIVEL[a.nivel],
          ),
          areaPrioritaria: prioridadDiagnostico ?? prioridadReciente ?? null,
          diagnostico: {
            estado: !diagnostico
              ? 'NO_INICIADO'
              : diagnostico.completadoEn
                ? 'COMPLETADO'
                : 'EN_PROGRESO',
            porcentaje: diagnostico?.porcentaje ?? null,
          },
          actividad: {
            ultimaActividad,
            diasSinActividad,
            respuestasUltimos30Dias: resumenReciente.total,
            porcentajeAciertosReciente: porcentajeReciente,
          },
          progreso: {
            temasCompletados,
            totalSubtemas,
            porcentaje:
              totalSubtemas > 0
                ? Math.round((temasCompletados / totalSubtemas) * 100)
                : 0,
          },
        },
      ];
    });

    alertas.sort((a, b) => {
      const diferenciaNivel =
        PRIORIDAD_NIVEL[b.nivel] - PRIORIDAD_NIVEL[a.nivel];
      if (diferenciaNivel !== 0) return diferenciaNivel;
      if (a.actividad.diasSinActividad !== b.actividad.diasSinActividad) {
        return b.actividad.diasSinActividad - a.actividad.diasSinActividad;
      }
      return a.estudiante.nombre.localeCompare(b.estudiante.nombre, 'es');
    });

    const contar = (nivel: NivelRiesgo) =>
      alertas.filter((alerta) => alerta.nivel === nivel).length;

    return {
      alcance:
        membresia.rol === 'PROFESOR' ? 'GRUPOS_ASIGNADOS' : 'INSTITUCION',
      generadoEn: ahora,
      resumen: {
        totalEstudiantes: estudiantes.length,
        enRiesgo: alertas.length,
        criticas: contar('CRITICA'),
        altas: contar('ALTA'),
        atencion: contar('ATENCION'),
        sinAlertas: estudiantes.length - alertas.length,
      },
      alertas,
    };
  }
}
