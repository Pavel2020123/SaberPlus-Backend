import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AreaIcfes,
  CalendarioTipo,
  Dificultad,
  EstadoContenido,
  RolUsuario,
  TipoInteractivo,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../common/constants';
import { generarCodigoConPrefijo } from '../institucion/utils/generar-codigo.util';
import {
  CONTRASENA_SEGURA_MENSAJE,
  esContrasenaSegura,
} from '../common/password-policy';
import {
  LIMITE_ESTUDIANTES_GRATIS,
  LIMITE_ESTUDIANTES_SIN_ANUNCIOS,
  LIMITE_GRUPOS_GRATIS,
  LIMITE_GRUPOS_SIN_ANUNCIOS,
  normalizarPlanInstitucional,
  PlanInstitucional,
} from '../institucion/institucion-plan.util';
import { createQuestionFingerprint } from '../common/question-fingerprint';
import { validateAcademicClassification } from './academic-classification';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ─── USUARIOS ───────────────────────────────────────────────
  async obtenerUsuarios() {
    return this.prisma.usuario.findMany({
      select: {
        id: true,
        nombre: true,
        correo: true,
        rol: true,
        xpTotal: true,
        fechaCreacion: true,
      },
      orderBy: { fechaCreacion: 'desc' },
    });
  }

  async cambiarRol(usuarioId: string, rol: RolUsuario) {
    return this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { rol },
      select: { id: true, nombre: true, rol: true },
    });
  }

  async eliminarUsuario(usuarioId: string, solicitanteId: string) {
    if (usuarioId === solicitanteId) {
      throw new BadRequestException(
        'No puedes eliminar tu propia cuenta de administrador.',
      );
    }
    return this.prisma.usuario.delete({
      where: { id: usuarioId },
      select: { id: true, nombre: true, correo: true },
    });
  }

  async crearInstitucionDesdeLead(datos: {
    leadId: string;
    contrasenaTemporal: string;
    planActual?: string;
    limiteGrupos?: number;
    limiteEstudiantes?: number;
    calendarioIcfes?: CalendarioTipo;
    fechaVencimientoPlan?: Date;
  }) {
    if (!esContrasenaSegura(datos.contrasenaTemporal)) {
      throw new BadRequestException(CONTRASENA_SEGURA_MENSAJE);
    }

    const lead = await this.prisma.leadVentas.findUnique({
      where: { id: datos.leadId },
    });
    if (!lead) throw new BadRequestException('El lead no existe.');
    if (lead.atendido) {
      throw new BadRequestException(
        'Este lead ya fue convertido o marcado como atendido.',
      );
    }

    const usuarioExistente = await this.prisma.usuario.findUnique({
      where: { correo: lead.correo.trim().toLowerCase() },
      select: { id: true },
    });
    if (usuarioExistente) {
      throw new BadRequestException(
        'El correo del contacto ya tiene una cuenta. Usa un correo distinto antes de crear la institución.',
      );
    }

    const contrasenaHash = await bcrypt.hash(
      datos.contrasenaTemporal,
      BCRYPT_SALT_ROUNDS,
    );
    const codigoUnico = await generarCodigoConPrefijo(
      'INST',
      async (codigo) =>
        (await this.prisma.institucion.findUnique({
          where: { codigoUnico: codigo },
        })) !== null,
    );

    const convocatoriaActiva = await this.prisma.calendarioIcfes.findFirst({
      where: { activo: true },
    });
    if (!convocatoriaActiva && !datos.fechaVencimientoPlan) {
      throw new BadRequestException(
        'Crea y activa una convocatoria ICFES antes de habilitar la institución.',
      );
    }
    const calendario =
      datos.calendarioIcfes ?? convocatoriaActiva?.calendario ?? 'A';
    const vencimiento =
      datos.fechaVencimientoPlan ??
      (convocatoriaActiva
        ? this.finDelDia(convocatoriaActiva.fechaExamen)
        : undefined);

    const plan = normalizarPlanInstitucional(datos.planActual || lead.plan);
    const resultado = await this.prisma.$transaction(async (tx) => {
      const institucion = await tx.institucion.create({
        data: {
          nombre: lead.nombreColegio,
          codigoUnico,
          planActual: plan,
          limiteGrupos:
            datos.limiteGrupos ??
            (plan === 'GRATIS'
              ? LIMITE_GRUPOS_GRATIS
              : LIMITE_GRUPOS_SIN_ANUNCIOS),
          limiteEstudiantes:
            datos.limiteEstudiantes ??
            (plan === 'GRATIS'
              ? LIMITE_ESTUDIANTES_GRATIS
              : LIMITE_ESTUDIANTES_SIN_ANUNCIOS),
          calendarioIcfes: calendario,
          fechaVencimientoPlan: vencimiento,
        },
      });
      const responsable = await tx.usuario.create({
        data: {
          nombre: lead.nombreContacto,
          correo: lead.correo.trim().toLowerCase(),
          contrasenaHash,
          rol: 'PROFESOR',
          correoVerificado: true,
          institucionId: institucion.id,
          debeCambiarContrasena: true,
        },
        select: { id: true, nombre: true, correo: true },
      });
      await tx.leadVentas.update({
        where: { id: lead.id },
        data: { atendido: true },
      });
      return { institucion, responsable };
    });

    return {
      mensaje: 'Institución creada y lead marcado como atendido.',
      institucion: resultado.institucion,
      responsable: resultado.responsable,
    };
  }

  async actualizarPlanInstitucional(
    institucionId: string,
    actorId: string,
    plan: PlanInstitucional,
    fechaVencimientoPlan?: Date | null,
  ) {
    const existente = await this.prisma.institucion.findUnique({
      where: { id: institucionId },
      select: { id: true, planActual: true },
    });
    if (!existente) throw new NotFoundException('La institución no existe.');

    const esGratuito = plan === 'GRATIS';
    const actualizado = await this.prisma.$transaction(async (tx) => {
      const institucion = await tx.institucion.update({
        where: { id: institucionId },
        data: {
          planActual: plan,
          limiteGrupos: esGratuito
            ? LIMITE_GRUPOS_GRATIS
            : LIMITE_GRUPOS_SIN_ANUNCIOS,
          limiteEstudiantes: esGratuito
            ? LIMITE_ESTUDIANTES_GRATIS
            : LIMITE_ESTUDIANTES_SIN_ANUNCIOS,
          fechaVencimientoPlan: esGratuito
            ? null
            : (fechaVencimientoPlan ?? null),
        },
        select: {
          id: true,
          nombre: true,
          planActual: true,
          limiteGrupos: true,
          limiteEstudiantes: true,
          fechaVencimientoPlan: true,
        },
      });
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId,
          actorId,
          accion: 'PLAN_INSTITUCIONAL_ACTUALIZADO',
          detalle: {
            planAnterior: existente.planActual,
            planNuevo: plan,
            fechaVencimientoPlan: institucion.fechaVencimientoPlan,
          },
        },
      });
      return institucion;
    });

    return actualizado;
  }

  private finDelDia(fecha: Date) {
    const fin = new Date(fecha);
    fin.setHours(23, 59, 59, 999);
    return fin;
  }

  // ─── TEMAS ───────────────────────────────────────────────────
  async obtenerTemas() {
    return this.prisma.tema.findMany({
      include: {
        subtemas: {
          include: {
            _count: { select: { preguntas: true } },
          },
        },
      },
      orderBy: { area: 'asc' },
    });
  }

  async eliminarTema(temaId: string) {
    const tema = await this.prisma.tema.findUnique({
      where: { id: temaId },
      select: {
        estadoContenido: true,
        _count: { select: { subtemas: true } },
      },
    });
    if (!tema) throw new NotFoundException('El tema no existe.');
    if (tema.estadoContenido !== EstadoContenido.BORRADOR) {
      throw new BadRequestException(
        'Solo se puede eliminar un tema nuevo en borrador. Archívalo para retirarlo sin perder datos.',
      );
    }
    if (tema._count.subtemas > 0) {
      throw new BadRequestException(
        'El tema tiene subtemas. Archívalo en lugar de borrar su contenido.',
      );
    }
    return this.prisma.tema.delete({ where: { id: temaId } });
  }

  async eliminarSubtema(subtemaId: string) {
    const subtema = await this.prisma.subtema.findUnique({
      where: { id: subtemaId },
      select: {
        estadoContenido: true,
        _count: { select: { preguntas: true, progresotemas: true } },
      },
    });
    if (!subtema) throw new NotFoundException('El subtema no existe.');
    if (subtema.estadoContenido !== EstadoContenido.BORRADOR) {
      throw new BadRequestException(
        'Solo se puede eliminar un subtema nuevo en borrador. Archívalo para retirarlo sin perder datos.',
      );
    }
    if (subtema._count.preguntas > 0 || subtema._count.progresotemas > 0) {
      throw new BadRequestException(
        'El subtema ya tiene contenido o progreso asociado. Archívalo en lugar de borrarlo.',
      );
    }
    return this.prisma.subtema.delete({ where: { id: subtemaId } });
  }

  async actualizarContenidoSubtema(
    subtemaId: string,
    contenido?: string,
    videoUrl?: string,
    imagenUrl?: string,
  ) {
    await this.validarSubtemaParaContenido(subtemaId);
    return this.prisma.subtema.update({
      where: { id: subtemaId },
      data: {
        ...(contenido !== undefined && { contenido }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...(imagenUrl !== undefined && { imagenUrl }),
        estadoContenido: EstadoContenido.BORRADOR,
      },
    });
  }

  async actualizarInteractivoSubtema(
    subtemaId: string,
    tipoInteractivo: TipoInteractivo,
    datosInteractivo: {
      textoConEspacios: string;
      espacios: { opciones: string[]; correctaIndex: number }[];
    },
  ) {
    await this.validarSubtemaParaContenido(subtemaId);
    return this.prisma.subtema.update({
      where: { id: subtemaId },
      data: {
        tipoInteractivo,
        datosInteractivo,
        estadoContenido: EstadoContenido.BORRADOR,
      },
    });
  }

  // ─── PREGUNTAS ──────────────────────────────────────────────
  private async validarSubtemaParaContenido(id: string) {
    const subtema = await this.prisma.subtema.findUnique({
      where: { id },
      select: {
        nombre: true,
        estadoContenido: true,
        tema: { select: { nombre: true, estadoContenido: true } },
      },
    });
    if (!subtema) throw new NotFoundException('El subtema no existe.');
    validateAcademicClassification(subtema);
  }

  listarCasosPreguntas(area?: AreaIcfes) {
    return this.prisma.casoPregunta.findMany({
      where: area ? { area } : undefined,
      include: { _count: { select: { preguntas: true } } },
      orderBy: { fechaCreacion: 'desc' },
    });
  }

  crearCasoPregunta(datos: {
    area: AreaIcfes;
    contexto: string;
    titulo?: string;
    imagenUrl?: string;
  }) {
    const contexto = datos.contexto.trim();
    if (!contexto) {
      throw new BadRequestException(
        'El contexto del caso no puede estar vacío.',
      );
    }

    return this.prisma.casoPregunta.create({
      data: {
        area: datos.area,
        contexto,
        titulo: datos.titulo?.trim() || null,
        imagenUrl: datos.imagenUrl?.trim() || null,
      },
      include: { _count: { select: { preguntas: true } } },
    });
  }

  async actualizarCasoPregunta(
    id: string,
    datos: { contexto?: string; titulo?: string; imagenUrl?: string },
  ) {
    const existente = await this.prisma.casoPregunta.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existente) throw new BadRequestException('El caso no existe.');

    const contexto = datos.contexto?.trim();
    if (datos.contexto !== undefined && !contexto) {
      throw new BadRequestException(
        'El contexto del caso no puede estar vacío.',
      );
    }

    return this.prisma.casoPregunta.update({
      where: { id },
      data: {
        ...(contexto !== undefined && { contexto }),
        ...(datos.titulo !== undefined && {
          titulo: datos.titulo.trim() || null,
        }),
        ...(datos.imagenUrl !== undefined && {
          imagenUrl: datos.imagenUrl.trim() || null,
        }),
        estadoContenido: EstadoContenido.BORRADOR,
      },
      include: { _count: { select: { preguntas: true } } },
    });
  }

  async eliminarCasoPregunta(id: string) {
    const caso = await this.prisma.casoPregunta.findUnique({
      where: { id },
      include: { _count: { select: { preguntas: true } } },
    });
    if (!caso) throw new BadRequestException('El caso no existe.');
    if (caso.estadoContenido !== EstadoContenido.BORRADOR) {
      throw new BadRequestException(
        'Solo se puede eliminar un caso nuevo en borrador. Archívalo para retirarlo sin perder datos.',
      );
    }
    if (caso._count.preguntas > 0) {
      throw new BadRequestException(
        `Retira primero las ${caso._count.preguntas} pregunta(s) asociada(s) a este caso.`,
      );
    }

    return this.prisma.casoPregunta.delete({ where: { id } });
  }

  private async validarCasoParaArea(casoId: string, area: AreaIcfes) {
    const caso = await this.prisma.casoPregunta.findUnique({
      where: { id: casoId },
    });
    if (!caso) throw new BadRequestException('El caso seleccionado no existe.');
    if (caso.area !== area) {
      throw new BadRequestException(
        'El caso y la pregunta deben pertenecer a la misma área.',
      );
    }
    return caso;
  }

  async crearPregunta(
    enunciado: string,
    subtemaId: string,
    dificultad: Dificultad,
    respuestas: {
      texto: string;
      esCorrecta: boolean;
      explicacion?: string;
    }[],
    imagenUrl?: string,
    explicacion?: string,
    casoId?: string,
    ordenEnCaso?: number,
  ) {
    if (!casoId && ordenEnCaso !== undefined) {
      throw new BadRequestException(
        'El orden solo puede indicarse cuando la pregunta pertenece a un caso.',
      );
    }

    const subtema = await this.prisma.subtema.findUnique({
      where: { id: subtemaId },
      select: {
        nombre: true,
        estadoContenido: true,
        tema: { select: { nombre: true, area: true, estadoContenido: true } },
      },
    });
    if (!subtema) throw new BadRequestException('El subtema no existe.');
    validateAcademicClassification(subtema);

    let ordenFinal: number | null = null;
    if (casoId) {
      await this.validarCasoParaArea(casoId, subtema.tema.area);
      ordenFinal =
        ordenEnCaso ??
        (await this.prisma.pregunta.count({ where: { casoId } })) + 1;
    }

    const huellaContenido = createQuestionFingerprint({
      area: subtema.tema.area,
      enunciado,
      imagen: imagenUrl,
      opciones: respuestas.map((respuesta) => ({ texto: respuesta.texto })),
    });
    const duplicada = await this.prisma.pregunta.findFirst({
      where: {
        huellaContenido,
        estadoContenido: { not: EstadoContenido.ARCHIVADO },
      },
      select: { id: true, estadoContenido: true },
    });
    if (duplicada) {
      throw new BadRequestException(
        `La pregunta ya está registrada en estado ${duplicada.estadoContenido}.`,
      );
    }

    return this.prisma.pregunta.create({
      data: {
        enunciado,
        subtemaId,
        dificultad,
        imagenUrl: imagenUrl || null,
        explicacion: explicacion?.trim() || null,
        casoId: casoId || null,
        ordenEnCaso: ordenFinal,
        huellaContenido,
        respuestas: {
          create: respuestas.map((respuesta) => ({
            texto: respuesta.texto,
            esCorrecta: respuesta.esCorrecta,
            explicacion: respuesta.explicacion?.trim() || null,
          })),
        },
      },
      include: { respuestas: true, caso: true },
    });
  }
  // La carga rápida conserva la dificultad MEDIO, pero no crea Banco General.
  async crearPreguntaAleatoria(
    subtemaId: string,
    area: AreaIcfes,
    enunciado: string,
    respuestas: {
      texto: string;
      esCorrecta: boolean;
      explicacion?: string;
    }[],
    imagenUrl?: string,
    explicacion?: string,
    casoId?: string,
    ordenEnCaso?: number,
  ) {
    if (!subtemaId?.trim())
      throw new BadRequestException('Selecciona un subtema específico.');
    const subtema = await this.prisma.subtema.findUnique({
      where: { id: subtemaId },
      select: { tema: { select: { area: true } } },
    });
    if (!subtema || subtema.tema.area !== area) {
      throw new BadRequestException(
        'El subtema no pertenece al área seleccionada.',
      );
    }

    return this.crearPregunta(
      enunciado,
      subtemaId,
      'MEDIO',
      respuestas,
      imagenUrl,
      explicacion,
      casoId,
      ordenEnCaso,
    );
  }

  async asignarPreguntaACaso(
    preguntaId: string,
    casoId: string | null,
    ordenEnCaso?: number,
  ) {
    const pregunta = await this.prisma.pregunta.findUnique({
      where: { id: preguntaId },
      select: {
        id: true,
        casoId: true,
        ordenEnCaso: true,
        subtema: { select: { tema: { select: { area: true } } } },
      },
    });
    if (!pregunta) throw new BadRequestException('La pregunta no existe.');

    if (!casoId) {
      return this.prisma.pregunta.update({
        where: { id: preguntaId },
        data: {
          casoId: null,
          ordenEnCaso: null,
          estadoContenido: EstadoContenido.BORRADOR,
        },
        include: { respuestas: true, caso: true },
      });
    }

    await this.validarCasoParaArea(casoId, pregunta.subtema.tema.area);
    const ordenFinal =
      ordenEnCaso ??
      (pregunta.casoId === casoId ? pregunta.ordenEnCaso : null) ??
      (await this.prisma.pregunta.count({ where: { casoId } })) + 1;

    return this.prisma.pregunta.update({
      where: { id: preguntaId },
      data: {
        casoId,
        ordenEnCaso: ordenFinal,
        estadoContenido: EstadoContenido.BORRADOR,
      },
      include: { respuestas: true, caso: true },
    });
  }

  async obtenerPreguntasPorSubtema(subtemaId: string) {
    return this.prisma.pregunta.findMany({
      where: { subtemaId },
      include: { respuestas: true, caso: true },
      orderBy: [{ casoId: 'asc' }, { ordenEnCaso: 'asc' }, { id: 'asc' }],
    });
  }

  async obtenerEstadisticasPregunta(preguntaId: string) {
    const pregunta = await this.prisma.pregunta.findUnique({
      where: { id: preguntaId },
      select: {
        id: true,
        enunciado: true,
        dificultad: true,
        respuestas: {
          select: { id: true, texto: true, esCorrecta: true },
          orderBy: { id: 'asc' },
        },
        subtema: {
          select: {
            nombre: true,
            tema: { select: { nombre: true, area: true } },
          },
        },
      },
    });
    if (!pregunta) throw new NotFoundException('La pregunta no existe.');

    const [resumen, porResultado, porOpcion, estudiantes, porOrigen] =
      await Promise.all([
        this.prisma.historialRespuesta.aggregate({
          where: { preguntaId },
          _count: { _all: true },
          _avg: { tiempoRespuestaSegundos: true },
          _max: { fechaRespuesta: true },
        }),
        this.prisma.historialRespuesta.groupBy({
          by: ['esCorrecta'],
          where: { preguntaId },
          _count: { _all: true },
        }),
        this.prisma.historialRespuesta.groupBy({
          by: ['respuestaSeleccionadaId'],
          where: { preguntaId },
          _count: { _all: true },
        }),
        this.prisma.historialRespuesta.groupBy({
          by: ['usuarioId'],
          where: { preguntaId },
        }),
        this.prisma.historialRespuesta.groupBy({
          by: ['origen'],
          where: { preguntaId },
          _count: { _all: true },
        }),
      ]);

    const totalIntentos = resumen._count._all;
    const correctas =
      porResultado.find((grupo) => grupo.esCorrecta)?._count._all ?? 0;
    const porcentajeAciertos = totalIntentos
      ? Math.round((correctas / totalIntentos) * 1000) / 10
      : 0;
    const seleccionesPorOpcion = new Map(
      porOpcion.map((grupo) => [
        grupo.respuestaSeleccionadaId,
        grupo._count._all,
      ]),
    );
    const origenes = Object.fromEntries(
      porOrigen.map((grupo) => [grupo.origen, grupo._count._all]),
    );

    return {
      pregunta: {
        id: pregunta.id,
        enunciado: pregunta.enunciado,
        dificultadConfigurada: pregunta.dificultad,
        subtema: pregunta.subtema.nombre,
        tema: pregunta.subtema.tema.nombre,
        area: pregunta.subtema.tema.area,
      },
      totalIntentos,
      estudiantesUnicos: estudiantes.length,
      correctas,
      incorrectas: totalIntentos - correctas,
      porcentajeAciertos,
      dificultadObservada:
        totalIntentos === 0
          ? 'SIN_DATOS'
          : porcentajeAciertos >= 75
            ? 'FACIL'
            : porcentajeAciertos >= 45
              ? 'MEDIA'
              : 'DIFICIL',
      tiempoPromedioSegundos:
        resumen._avg.tiempoRespuestaSegundos === null
          ? null
          : Math.round(resumen._avg.tiempoRespuestaSegundos * 10) / 10,
      ultimaRespuesta: resumen._max.fechaRespuesta,
      porOrigen: {
        SIMULACRO: origenes.SIMULACRO ?? 0,
        PERSONALIZADO: origenes.PERSONALIZADO ?? 0,
        PRACTICA: origenes.PRACTICA ?? 0,
        DIAGNOSTICO: origenes.DIAGNOSTICO ?? 0,
      },
      opciones: pregunta.respuestas.map((respuesta) => {
        const selecciones = seleccionesPorOpcion.get(respuesta.id) ?? 0;
        return {
          ...respuesta,
          selecciones,
          porcentaje: totalIntentos
            ? Math.round((selecciones / totalIntentos) * 1000) / 10
            : 0,
        };
      }),
    };
  }

  async eliminarPregunta(preguntaId: string) {
    const pregunta = await this.prisma.pregunta.findUnique({
      where: { id: preguntaId },
      select: { estadoContenido: true, _count: true },
    });
    if (!pregunta) throw new NotFoundException('La pregunta no existe.');
    if (pregunta.estadoContenido !== EstadoContenido.BORRADOR) {
      throw new BadRequestException(
        'Solo se puede eliminar una pregunta nueva en borrador. Archívala para conservar su historial.',
      );
    }
    const relacionesConActividad = Object.entries(pregunta._count).some(
      ([relacion, cantidad]) =>
        relacion !== 'respuestas' && Number(cantidad) > 0,
    );
    if (relacionesConActividad) {
      throw new BadRequestException(
        'La pregunta ya tiene actividad asociada y no puede borrarse. Archívala.',
      );
    }
    await this.prisma.respuesta.deleteMany({
      where: { preguntaId },
    });
    return this.prisma.pregunta.delete({ where: { id: preguntaId } });
  }

  // ─── ESTADÍSTICAS GENERALES ─────────────────────────────────
  async obtenerEstadisticas() {
    const inicioDeHoy = new Date();
    inicioDeHoy.setHours(0, 0, 0, 0);

    const [
      totalUsuarios,
      totalPreguntas,
      totalTemas,
      totalSimulacros,
      totalEstudiantes,
      totalProfesores,
      totalInstituciones,
      estudiantesRegistradosHoy,
      simulacrosResueltosHoy,
    ] = await Promise.all([
      this.prisma.usuario.count(),
      this.prisma.pregunta.count(),
      this.prisma.tema.count(),
      this.prisma.resultadoSimulacro.count(),
      this.prisma.usuario.count({ where: { rol: 'ESTUDIANTE' } }),
      this.prisma.usuario.count({ where: { rol: 'PROFESOR' } }),
      this.prisma.institucion.count(),
      this.prisma.usuario.count({
        where: { rol: 'ESTUDIANTE', fechaCreacion: { gte: inicioDeHoy } },
      }),
      this.prisma.resultadoSimulacro.count({
        where: { fechaRealizado: { gte: inicioDeHoy } },
      }),
    ]);

    return {
      totalUsuarios,
      totalPreguntas,
      totalTemas,
      totalSimulacros,
      totalEstudiantes,
      totalProfesores,
      totalInstituciones,
      estudiantesRegistradosHoy,
      simulacrosResueltosHoy,
    };
  }
}
