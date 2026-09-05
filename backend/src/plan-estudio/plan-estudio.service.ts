import { ForbiddenException, Injectable } from '@nestjs/common';
import { AreaIcfes, CalendarioTipo, TipoActividadPlan } from '@prisma/client';
import { CalendarioIcfesService } from '../calendario-icfes/calendario-icfes.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ESTADO_PUBLICADO,
  temaPublicadoWhere,
} from '../common/contenido-publicado';

const MILISEGUNDOS_DIA = 86_400_000;

type Candidato = {
  id: string;
  nombre: string;
  tema: string;
  area: AreaIcfes;
  porcentaje: number;
};

type ActividadNueva = {
  fecha: Date;
  tipo: TipoActividadPlan;
  area?: AreaIcfes;
  titulo: string;
  detalle: string;
  minutos: number;
  orden: number;
  subtemaId?: string;
};

@Injectable()
export class PlanEstudioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarioService: CalendarioIcfesService,
  ) {}

  async obtenerPlanSemanal(usuarioId: string) {
    const [usuario, diagnostico, convocatoria] = await Promise.all([
      this.prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { rol: true },
      }),
      this.prisma.diagnosticoInicial.findFirst({
        where: { usuarioId, completadoEn: { not: null } },
        include: { resultadosPorArea: true },
      }),
      this.calendarioService.obtenerCalendarioActivo(),
    ]);

    if (usuario?.rol !== 'ESTUDIANTE') {
      throw new ForbiddenException(
        'El plan semanal automático está disponible para estudiantes.',
      );
    }
    if (!diagnostico) return { estado: 'DIAGNOSTICO_PENDIENTE' as const };
    if (!convocatoria) return { estado: 'FECHA_PENDIENTE' as const };

    const hoy = this.fechaColombia();
    const fechaExamen = this.soloFecha(convocatoria.fechaExamen);
    const diasRestantes = this.diferenciaDias(hoy, fechaExamen);
    const convocatoriaPublica = {
      calendario: convocatoria.calendario,
      fechaExamen: this.claveFecha(fechaExamen),
      diasRestantes,
      semanasRestantes: Math.max(0, Math.ceil(diasRestantes / 7)),
    };

    if (diasRestantes < 0) {
      return {
        estado: 'CONVOCATORIA_FINALIZADA' as const,
        convocatoria: convocatoriaPublica,
      };
    }

    const inicioSemana = this.inicioDeSemana(hoy);
    const finSemana = this.sumarDias(inicioSemana, 6);
    let plan = await this.prisma.planEstudioSemanal.findUnique({
      where: { usuarioId_inicioSemana: { usuarioId, inicioSemana } },
      include: { actividades: { orderBy: { orden: 'asc' } } },
    });

    const cambioBase =
      plan &&
      (plan.diagnosticoId !== diagnostico.id ||
        plan.calendarioIcfes !== convocatoria.calendario ||
        this.claveFecha(plan.fechaExamen) !== this.claveFecha(fechaExamen));

    if (!plan || cambioBase) {
      const resultado = await this.generarActividades(
        usuarioId,
        diagnostico.resultadosPorArea,
        hoy,
        finSemana,
        fechaExamen,
        diasRestantes,
      );

      if (resultado.estado !== 'LISTO') {
        return {
          estado: resultado.estado,
          convocatoria: convocatoriaPublica,
        };
      }

      const sesionesObjetivo = resultado.actividades.filter((actividad) =>
        ['ESTUDIO', 'SIMULACRO'].includes(actividad.tipo),
      ).length;
      const minutosObjetivoSemanal = resultado.actividades.reduce(
        (total, actividad) => total + actividad.minutos,
        0,
      );

      plan = await this.prisma.$transaction(async (tx) => {
        if (plan) {
          await tx.planEstudioActividad.deleteMany({
            where: { planId: plan.id },
          });
          return tx.planEstudioSemanal.update({
            where: { id: plan.id },
            data: {
              diagnosticoId: diagnostico.id,
              calendarioIcfes: convocatoria.calendario,
              fechaExamen,
              finSemana,
              diasRestantesAlGenerar: diasRestantes,
              sesionesObjetivo,
              minutosObjetivoSemanal,
              fechaCreacion: new Date(),
              actividades: { create: resultado.actividades },
            },
            include: { actividades: { orderBy: { orden: 'asc' } } },
          });
        }

        return tx.planEstudioSemanal.create({
          data: {
            usuarioId,
            diagnosticoId: diagnostico.id,
            calendarioIcfes: convocatoria.calendario,
            fechaExamen,
            inicioSemana,
            finSemana,
            diasRestantesAlGenerar: diasRestantes,
            sesionesObjetivo,
            minutosObjetivoSemanal,
            actividades: { create: resultado.actividades },
          },
          include: { actividades: { orderBy: { orden: 'asc' } } },
        });
      });
    }

    return this.presentarPlan(
      usuarioId,
      plan,
      diagnostico,
      convocatoriaPublica,
    );
  }

  private async generarActividades(
    usuarioId: string,
    resultados: Array<{ area: AreaIcfes; porcentaje: number }>,
    hoy: Date,
    finSemana: Date,
    fechaExamen: Date,
    diasRestantes: number,
  ): Promise<
    | { estado: 'SIN_CONTENIDO' | 'TODO_COMPLETADO' }
    | { estado: 'LISTO'; actividades: ActividadNueva[] }
  > {
    const [temas, progresos] = await Promise.all([
      this.prisma.tema.findMany({
        where: temaPublicadoWhere(),
        include: {
          subtemas: { where: { estadoContenido: ESTADO_PUBLICADO } },
        },
        orderBy: [{ area: 'asc' }, { nombre: 'asc' }],
      }),
      this.prisma.progresoTema.findMany({ where: { usuarioId } }),
    ]);

    const totalSubtemas = temas.reduce(
      (total, tema) => total + tema.subtemas.length,
      0,
    );
    if (totalSubtemas === 0) return { estado: 'SIN_CONTENIDO' };

    const progresoPorSubtema = new Map(
      progresos.map((progreso) => [progreso.subtemaId, progreso]),
    );
    const candidatos: Candidato[] = temas.flatMap((tema) =>
      tema.subtemas
        .filter((subtema) => !progresoPorSubtema.get(subtema.id)?.completado)
        .map((subtema) => ({
          id: subtema.id,
          nombre: subtema.nombre,
          tema: tema.nombre,
          area: tema.area,
          porcentaje: progresoPorSubtema.get(subtema.id)?.porcentaje ?? 0,
        })),
    );
    if (candidatos.length === 0) return { estado: 'TODO_COMPLETADO' };

    const areasOrdenadas = resultados
      .slice()
      .sort((a, b) => a.porcentaje - b.porcentaje)
      .map((resultado) => resultado.area);
    for (const area of Object.values(AreaIcfes)) {
      if (!areasOrdenadas.includes(area)) areasOrdenadas.push(area);
    }

    const colas = new Map<AreaIcfes, Candidato[]>();
    for (const area of areasOrdenadas) {
      colas.set(
        area,
        candidatos
          .filter((candidato) => candidato.area === area)
          .sort(
            (a, b) =>
              a.porcentaje - b.porcentaje ||
              a.tema.localeCompare(b.tema) ||
              a.nombre.localeCompare(b.nombre),
          ),
      );
    }

    const intensidad =
      diasRestantes <= 30
        ? { sesiones: 6, minutos: 60, simulacro: true }
        : diasRestantes <= 90
          ? { sesiones: 6, minutos: 45, simulacro: false }
          : { sesiones: 5, minutos: 40, simulacro: false };
    const limite = fechaExamen < finSemana ? fechaExamen : finSemana;
    const fechasDisponibles: Date[] = [];
    for (let fecha = hoy; fecha <= limite; fecha = this.sumarDias(fecha, 1)) {
      fechasDisponibles.push(fecha);
    }

    const claveExamen = this.claveFecha(fechaExamen);
    const fechasTrabajo = fechasDisponibles.filter(
      (fecha) => this.claveFecha(fecha) !== claveExamen,
    );
    const cantidadSesiones = Math.min(
      intensidad.sesiones,
      fechasTrabajo.length,
    );
    const incluirSimulacro = intensidad.simulacro && cantidadSesiones >= 2;
    const cantidadEstudio = Math.min(
      candidatos.length,
      cantidadSesiones - (incluirSimulacro ? 1 : 0),
    );
    const seleccionados: Candidato[] = [];

    while (seleccionados.length < cantidadEstudio) {
      let agregado = false;
      for (const area of areasOrdenadas) {
        const siguiente = colas.get(area)?.shift();
        if (!siguiente) continue;
        seleccionados.push(siguiente);
        agregado = true;
        if (seleccionados.length === cantidadEstudio) break;
      }
      if (!agregado) break;
    }

    const actividades: ActividadNueva[] = [];
    let indiceTrabajo = 0;
    for (const candidato of seleccionados) {
      actividades.push({
        fecha: fechasTrabajo[indiceTrabajo++],
        tipo: TipoActividadPlan.ESTUDIO,
        area: candidato.area,
        titulo: `${candidato.tema}: ${candidato.nombre}`,
        detalle:
          candidato.area === areasOrdenadas[0]
            ? 'Área prioritaria de tu diagnóstico. Estudia el contenido y practica sus preguntas.'
            : 'Avanza en el contenido y termina con una práctica corta.',
        minutos: intensidad.minutos,
        orden: 0,
        subtemaId: candidato.id,
      });
    }

    if (incluirSimulacro && fechasTrabajo[indiceTrabajo]) {
      actividades.push({
        fecha: fechasTrabajo[indiceTrabajo++],
        tipo: TipoActividadPlan.SIMULACRO,
        titulo: 'Simulacro de seguimiento',
        detalle:
          'Mide tu avance y detecta qué debes reforzar antes del examen.',
        minutos: intensidad.minutos,
        orden: 0,
      });
    }

    for (const fecha of fechasDisponibles) {
      const clave = this.claveFecha(fecha);
      if (
        actividades.some(
          (actividad) => this.claveFecha(actividad.fecha) === clave,
        )
      ) {
        continue;
      }
      if (clave === claveExamen) {
        actividades.push({
          fecha,
          tipo: TipoActividadPlan.EXAMEN,
          titulo: 'Día del examen ICFES',
          detalle: 'Confía en tu preparación y administra bien el tiempo.',
          minutos: 0,
          orden: 0,
        });
      } else {
        actividades.push({
          fecha,
          tipo: TipoActividadPlan.DESCANSO,
          titulo: 'Pausa y repaso ligero',
          detalle:
            'Descansa o revisa tus apuntes sin añadir una sesión obligatoria.',
          minutos: 0,
          orden: 0,
        });
      }
    }

    actividades
      .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
      .forEach((actividad, indice) => (actividad.orden = indice + 1));
    return { estado: 'LISTO', actividades };
  }

  private async presentarPlan(
    usuarioId: string,
    plan: {
      id: string;
      inicioSemana: Date;
      finSemana: Date;
      fechaCreacion: Date;
      sesionesObjetivo: number;
      minutosObjetivoSemanal: number;
      actividades: Array<{
        id: string;
        fecha: Date;
        tipo: TipoActividadPlan;
        area: AreaIcfes | null;
        titulo: string;
        detalle: string;
        minutos: number;
        subtemaId: string | null;
      }>;
    },
    diagnostico: {
      porcentaje: number | null;
      resultadosPorArea: Array<{ area: AreaIcfes; porcentaje: number }>;
    },
    convocatoria: {
      calendario: CalendarioTipo;
      fechaExamen: string;
      diasRestantes: number;
      semanasRestantes: number;
    },
  ) {
    const subtemaIds = plan.actividades
      .map((actividad) => actividad.subtemaId)
      .filter((id): id is string => Boolean(id));
    const finConsulta = this.sumarDias(plan.finSemana, 1);
    const [progresosUsuario, simulacroUsuario] = await Promise.all([
      this.prisma.progresoTema.findMany({
        where: { usuarioId, subtemaId: { in: subtemaIds } },
      }),
      this.prisma.resultadoSimulacro.findFirst({
        where: {
          usuarioId,
          fechaRealizado: { gte: plan.fechaCreacion, lt: finConsulta },
        },
        select: { id: true },
      }),
    ]);
    const progresoPorSubtema = new Map(
      progresosUsuario.map((progreso) => [progreso.subtemaId, progreso]),
    );
    const dias = plan.actividades.map((actividad) => {
      const progreso = actividad.subtemaId
        ? progresoPorSubtema.get(actividad.subtemaId)
        : null;
      const completada =
        actividad.tipo === TipoActividadPlan.ESTUDIO
          ? Boolean(
              progreso?.completado ||
              (progreso && progreso.fechaVisto >= plan.fechaCreacion),
            )
          : actividad.tipo === TipoActividadPlan.SIMULACRO
            ? Boolean(simulacroUsuario)
            : false;
      const accion =
        actividad.tipo === TipoActividadPlan.ESTUDIO &&
        actividad.area &&
        actividad.subtemaId
          ? {
              href: `/estudiar/${actividad.area}?subtema=${actividad.subtemaId}`,
              etiqueta: 'Estudiar',
            }
          : actividad.tipo === TipoActividadPlan.SIMULACRO
            ? {
                href: '/simulacro-personalizado',
                etiqueta: 'Hacer simulacro',
              }
            : null;
      return {
        ...actividad,
        fecha: this.claveFecha(actividad.fecha),
        completada,
        accion,
      };
    });
    const sesionesCompletadas = dias.filter(
      (dia) => ['ESTUDIO', 'SIMULACRO'].includes(dia.tipo) && dia.completada,
    ).length;
    const resultadosOrdenados = diagnostico.resultadosPorArea
      .slice()
      .sort((a, b) => a.porcentaje - b.porcentaje);

    return {
      estado: 'LISTO' as const,
      semana: {
        inicio: this.claveFecha(plan.inicioSemana),
        fin: this.claveFecha(plan.finSemana),
        fechaCreacion: plan.fechaCreacion,
      },
      convocatoria,
      diagnostico: {
        porcentaje: diagnostico.porcentaje ?? 0,
        areaPrioritaria: resultadosOrdenados[0]?.area ?? null,
        resultadosPorArea: resultadosOrdenados,
      },
      resumen: {
        sesionesObjetivo: plan.sesionesObjetivo,
        sesionesCompletadas,
        minutosObjetivoSemanal: plan.minutosObjetivoSemanal,
        porcentaje:
          plan.sesionesObjetivo > 0
            ? Math.round((sesionesCompletadas / plan.sesionesObjetivo) * 100)
            : 0,
      },
      dias,
    };
  }

  private fechaColombia() {
    const partes = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const valor = (tipo: string) =>
      Number(partes.find((parte) => parte.type === tipo).value);
    return new Date(Date.UTC(valor('year'), valor('month') - 1, valor('day')));
  }

  private soloFecha(fecha: Date) {
    return new Date(
      Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()),
    );
  }

  private inicioDeSemana(fecha: Date) {
    const diasDesdeLunes = (fecha.getUTCDay() + 6) % 7;
    return this.sumarDias(fecha, -diasDesdeLunes);
  }

  private sumarDias(fecha: Date, dias: number) {
    return new Date(fecha.getTime() + dias * MILISEGUNDOS_DIA);
  }

  private diferenciaDias(inicio: Date, fin: Date) {
    return Math.round((fin.getTime() - inicio.getTime()) / MILISEGUNDOS_DIA);
  }

  private claveFecha(fecha: Date) {
    return fecha.toISOString().slice(0, 10);
  }
}
