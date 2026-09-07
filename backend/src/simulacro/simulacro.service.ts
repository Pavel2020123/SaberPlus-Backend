import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AreaIcfes, Dificultad, OrigenRespuesta, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  ESTADO_PUBLICADO,
  preguntaPublicadaWhere,
  subtemaPublicadoWhere,
  temaPublicadoWhere,
} from '../common/contenido-publicado';

interface RespuestaEstudiante {
  preguntaId: string;
  respuestaId: string;
  tiempoRespuestaSegundos?: number;
}

interface PreguntaCalificable {
  id: string;
  enunciado: string;
  imagenUrl: string | null;
  explicacion: string | null;
  ordenEnCaso: number | null;
  caso: {
    id: string;
    titulo: string | null;
    contexto: string;
    imagenUrl: string | null;
    area: AreaIcfes;
  } | null;
  respuestas: {
    id: string;
    texto: string;
    explicacion: string | null;
    esCorrecta: boolean;
  }[];
}

export interface DetalleRevision {
  preguntaId: string;
  enunciado: string;
  imagenUrl: string | null;
  esCorrecto: boolean;
  respuestaSeleccionadaId: string;
  respuestaCorrectaId: string;
  explicacion: string | null;
  ordenEnCaso: number | null;
  caso: PreguntaCalificable['caso'];
  respuestas: PreguntaCalificable['respuestas'];
}

@Injectable()
export class SimulacroService {
  constructor(private prisma: PrismaService) {}

  private readonly duracionIntentoMs = 2 * 60 * 60 * 1000;

  private async crearIntento(
    usuarioId: string,
    origen: OrigenRespuesta,
    preguntaIds: string[],
    area?: AreaIcfes,
  ) {
    return this.prisma.intentoSimulacro.create({
      data: {
        usuarioId,
        origen,
        area,
        preguntaIds,
        expira: new Date(Date.now() + this.duracionIntentoMs),
      },
      select: { id: true },
    });
  }

  private async validarIntento(
    usuarioId: string,
    intentoId: string,
    origen: OrigenRespuesta,
    respuestas: RespuestaEstudiante[],
    area?: AreaIcfes,
  ) {
    const preguntaIds = respuestas.map((respuesta) => respuesta.preguntaId);
    if (new Set(preguntaIds).size !== preguntaIds.length) {
      throw new BadRequestException(
        'No puedes enviar la misma pregunta más de una vez.',
      );
    }

    const intento = await this.prisma.intentoSimulacro.findFirst({
      where: { id: intentoId, usuarioId, origen },
      select: {
        preguntaIds: true,
        area: true,
        expira: true,
        consumidoEn: true,
      },
    });
    if (!intento || intento.consumidoEn || intento.expira <= new Date()) {
      throw new BadRequestException(
        'Este intento no existe, ya fue calificado o expiró.',
      );
    }
    if (area && intento.area !== area) {
      throw new BadRequestException('El intento no corresponde a esa área.');
    }

    const esperadas = Array.isArray(intento.preguntaIds)
      ? intento.preguntaIds.filter((id): id is string => typeof id === 'string')
      : [];
    const recibidas = new Set(preguntaIds);
    if (
      esperadas.length !== preguntaIds.length ||
      esperadas.some((id) => !recibidas.has(id))
    ) {
      throw new BadRequestException(
        'Las respuestas no corresponden a las preguntas de este intento.',
      );
    }
  }

  private async consumirIntento(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    intentoId: string,
  ) {
    const consumido = await tx.intentoSimulacro.updateMany({
      where: {
        id: intentoId,
        usuarioId,
        consumidoEn: null,
        expira: { gt: new Date() },
      },
      data: { consumidoEn: new Date() },
    });
    if (consumido.count !== 1) {
      throw new BadRequestException('Este intento ya fue calificado o expiró.');
    }
  }

  private mezclarPreguntas<T>(elementos: T[]): T[] {
    const copia = [...elementos];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  private seleccionarPreguntasAgrupadas<
    T extends {
      id: string;
      ordenEnCaso: number | null;
      caso: { id: string } | null;
    },
  >(preguntas: T[], cantidad: number): T[] {
    const grupos = new Map<string, T[]>();

    for (const pregunta of preguntas) {
      const clave = pregunta.caso
        ? `caso:${pregunta.caso.id}`
        : `pregunta:${pregunta.id}`;
      const grupo = grupos.get(clave) ?? [];
      grupo.push(pregunta);
      grupos.set(clave, grupo);
    }

    const gruposMezclados = this.mezclarPreguntas([...grupos.values()]);
    const seleccionadas: T[] = [];

    for (const grupo of gruposMezclados) {
      grupo.sort(
        (a, b) =>
          (a.ordenEnCaso ?? Number.MAX_SAFE_INTEGER) -
          (b.ordenEnCaso ?? Number.MAX_SAFE_INTEGER),
      );

      if (seleccionadas.length === 0 && grupo.length > cantidad) {
        return grupo;
      }
      if (seleccionadas.length + grupo.length <= cantidad) {
        seleccionadas.push(...grupo);
      }
      if (seleccionadas.length === cantidad) break;
    }

    return seleccionadas;
  }

  private construirDetalleRevision(
    pregunta: PreguntaCalificable | undefined,
    respuestaSeleccionadaId: string,
  ): DetalleRevision {
    const respuestaCorrectaId =
      pregunta?.respuestas.find((respuesta) => respuesta.esCorrecta)?.id ?? '';

    return {
      preguntaId: pregunta?.id ?? '',
      enunciado: pregunta?.enunciado ?? 'Pregunta no disponible',
      imagenUrl: pregunta?.imagenUrl ?? null,
      esCorrecto:
        respuestaCorrectaId !== '' &&
        respuestaCorrectaId === respuestaSeleccionadaId,
      respuestaSeleccionadaId,
      respuestaCorrectaId,
      explicacion: pregunta?.explicacion ?? null,
      ordenEnCaso: pregunta?.ordenEnCaso ?? null,
      caso: pregunta?.caso ?? null,
      respuestas: pregunta?.respuestas ?? [],
    };
  }

  // ─── GENERAR SIMULACRO ──────────────────────────────────────
  // Genera N preguntas aleatorias de un área, SIN enviar esCorrecta al cliente
  async generarSimulacro(
    usuarioId: string,
    area: AreaIcfes,
    cantidad: number = 25,
  ) {
    const todasLasPreguntas = await this.prisma.pregunta.findMany({
      where: preguntaPublicadaWhere({
        subtema: {
          tema: {
            area: area,
          },
        },
      }),
      select: {
        id: true,
        enunciado: true,
        imagenUrl: true,
        dificultad: true,
        ordenEnCaso: true,
        caso: {
          select: {
            id: true,
            titulo: true,
            contexto: true,
            imagenUrl: true,
            area: true,
          },
        },
        respuestas: {
          select: {
            id: true,
            texto: true,
            // ⚠️ SEGURIDAD: esCorrecta NUNCA viaja al cliente
          },
        },
        subtema: {
          select: {
            nombre: true,
            tema: {
              select: { nombre: true, area: true },
            },
          },
        },
      },
    });

    if (todasLasPreguntas.length === 0) {
      throw new NotFoundException(
        `No hay preguntas disponibles para el área ${area}. Usa POST /simulacros/poblar para agregar preguntas de prueba.`,
      );
    }

    const seleccionadas = this.seleccionarPreguntasAgrupadas(
      todasLasPreguntas,
      cantidad,
    );
    const intento = await this.crearIntento(
      usuarioId,
      OrigenRespuesta.SIMULACRO,
      seleccionadas.map((pregunta) => pregunta.id),
      area,
    );

    return {
      intentoId: intento.id,
      mensaje: `Simulacro de ${area} generado con éxito`,
      totalPreguntas: seleccionadas.length,
      preguntas: seleccionadas,
    };
  }

  // ─── CALIFICAR SIMULACRO ────────────────────────────────────
  // Recibe las respuestas del estudiante y devuelve el puntaje
  async calificarSimulacro(
    usuarioId: string,
    intentoId: string,
    area: AreaIcfes,
    respuestasEstudiante: RespuestaEstudiante[],
    origen: OrigenRespuesta = OrigenRespuesta.SIMULACRO,
  ) {
    if (!respuestasEstudiante || respuestasEstudiante.length === 0) {
      throw new NotFoundException(
        'No se recibieron respuestas para calificar.',
      );
    }

    await this.validarIntento(
      usuarioId,
      intentoId,
      origen,
      respuestasEstudiante,
      area,
    );

    const preguntaIds = respuestasEstudiante.map((r) => r.preguntaId);

    // Traemos las preguntas con sus respuestas CORRECTAS desde la BD (nunca salieron al cliente)
    const preguntasConRespuestas = await this.prisma.pregunta.findMany({
      where: { id: { in: preguntaIds } },
      select: {
        id: true,
        enunciado: true,
        imagenUrl: true,
        explicacion: true,
        ordenEnCaso: true,
        caso: {
          select: {
            id: true,
            titulo: true,
            contexto: true,
            imagenUrl: true,
            area: true,
          },
        },
        respuestas: {
          select: {
            id: true,
            texto: true,
            explicacion: true,
            esCorrecta: true,
          },
        },
        subtema: { select: { tema: { select: { area: true } } } },
      },
    });

    if (preguntasConRespuestas.length !== preguntaIds.length) {
      throw new BadRequestException(
        'Una o más preguntas del intento ya no están disponibles.',
      );
    }
    for (const pregunta of preguntasConRespuestas) {
      if (pregunta.subtema.tema.area !== area) {
        throw new BadRequestException('El intento contiene otra área.');
      }
      const respuesta = respuestasEstudiante.find(
        (item) => item.preguntaId === pregunta.id,
      );
      if (
        !respuesta ||
        !pregunta.respuestas.some((item) => item.id === respuesta.respuestaId)
      ) {
        throw new BadRequestException(
          'Una respuesta seleccionada no pertenece a su pregunta.',
        );
      }
    }

    const preguntaPorId = new Map(
      preguntasConRespuestas.map((pregunta) => [pregunta.id, pregunta]),
    );

    let correctas = 0;
    const detalle: DetalleRevision[] = [];
    const sesionId = randomUUID();
    const historial: Prisma.HistorialRespuestaCreateManyInput[] = [];

    for (const respuestaAlumno of respuestasEstudiante) {
      const revision = this.construirDetalleRevision(
        preguntaPorId.get(respuestaAlumno.preguntaId),
        respuestaAlumno.respuestaId,
      );
      if (!revision.preguntaId)
        revision.preguntaId = respuestaAlumno.preguntaId;
      if (revision.esCorrecto) correctas++;
      detalle.push(revision);
      if (revision.preguntaId && revision.respuestaCorrectaId) {
        historial.push({
          sesionId,
          usuarioId,
          preguntaId: revision.preguntaId,
          respuestaSeleccionadaId: respuestaAlumno.respuestaId,
          respuestaCorrectaId: revision.respuestaCorrectaId,
          area,
          origen,
          esCorrecta: revision.esCorrecto,
          tiempoRespuestaSegundos:
            respuestaAlumno.tiempoRespuestaSegundos ?? null,
        });
      }
    }

    const totalPreguntas = respuestasEstudiante.length;
    const puntaje = Math.round((correctas / totalPreguntas) * 100 * 10) / 10;

    // XP: 10 puntos base por respuesta correcta + bonus por puntaje alto
    const xpGanado =
      correctas * 10 + (puntaje >= 80 ? 50 : puntaje >= 60 ? 25 : 0);

    // Guardar resultado en la BD para estadísticas futuras
    if (usuarioId) {
      await this.prisma.$transaction(async (tx) => {
        await this.consumirIntento(tx, usuarioId, intentoId);
        await tx.resultadoSimulacro.create({
          data: {
            usuarioId,
            area,
            totalPreguntas,
            respuestasCorrectas: correctas,
            puntaje,
            xpGanado,
          },
        });
        await tx.historialRespuesta.createMany({ data: historial });
        await tx.usuario.update({
          where: { id: usuarioId },
          data: { xpTotal: { increment: xpGanado } },
        });
      });
    }

    return {
      mensaje: '¡Simulacro calificado!',
      resumen: {
        totalPreguntas,
        respuestasCorrectas: correctas,
        respuestasIncorrectas: totalPreguntas - correctas,
        puntaje: `${puntaje}%`,
        xpGanado,
      },
      detalle,
    };
  }

  // ─── GENERAR SIMULACRO PERSONALIZADO (PREGUNTAS ALEATORIAS) ─
  // El estudiante elige una o varias áreas (y opcionalmente una dificultad)
  // y recibe preguntas aleatorias mezcladas de esas áreas.
  async generarSimulacroPersonalizado(
    usuarioId: string,
    areas: AreaIcfes[],
    cantidad: number = 20,
    dificultad?: Dificultad,
  ) {
    if (!areas || areas.length === 0) {
      throw new NotFoundException(
        'Selecciona al menos un área para generar preguntas aleatorias.',
      );
    }

    const todasLasPreguntas = await this.prisma.pregunta.findMany({
      where: preguntaPublicadaWhere({
        subtema: {
          tema: {
            area: { in: areas },
          },
        },
        ...(dificultad ? { dificultad } : {}),
      }),
      select: {
        id: true,
        enunciado: true,
        imagenUrl: true,
        dificultad: true,
        ordenEnCaso: true,
        caso: {
          select: {
            id: true,
            titulo: true,
            contexto: true,
            imagenUrl: true,
            area: true,
          },
        },
        respuestas: {
          select: {
            id: true,
            texto: true,
            // ⚠️ SEGURIDAD: esCorrecta NUNCA viaja al cliente
          },
        },
        subtema: {
          select: {
            nombre: true,
            tema: {
              select: { nombre: true, area: true },
            },
          },
        },
      },
    });

    if (todasLasPreguntas.length === 0) {
      throw new NotFoundException(
        'No hay preguntas disponibles para las áreas seleccionadas todavía.',
      );
    }

    const seleccionadas = this.seleccionarPreguntasAgrupadas(
      todasLasPreguntas,
      cantidad,
    );
    const intento = await this.crearIntento(
      usuarioId,
      OrigenRespuesta.PERSONALIZADO,
      seleccionadas.map((pregunta) => pregunta.id),
    );

    return {
      intentoId: intento.id,
      mensaje: 'Simulacro personalizado generado con éxito',
      areasSeleccionadas: areas,
      totalPreguntas: seleccionadas.length,
      preguntas: seleccionadas,
    };
  }

  // ─── CALIFICAR SIMULACRO PERSONALIZADO ──────────────────────
  // No recibe un área única: la calcula por pregunta y guarda un
  // ResultadoSimulacro por cada área presente en el intento, para
  // que las estadísticas por área del dashboard sigan funcionando.
  async calificarSimulacroPersonalizado(
    usuarioId: string,
    intentoId: string,
    respuestasEstudiante: RespuestaEstudiante[],
  ) {
    return this.calificarSesionMixta(
      usuarioId,
      intentoId,
      respuestasEstudiante,
      OrigenRespuesta.PERSONALIZADO,
    );
  }

  async calificarRepasoAdaptativo(
    usuarioId: string,
    intentoId: string,
    respuestasEstudiante: RespuestaEstudiante[],
  ) {
    return this.calificarSesionMixta(
      usuarioId,
      intentoId,
      respuestasEstudiante,
      OrigenRespuesta.ADAPTATIVO,
    );
  }

  private async calificarSesionMixta(
    usuarioId: string,
    intentoId: string,
    respuestasEstudiante: RespuestaEstudiante[],
    origen: OrigenRespuesta,
  ) {
    if (!respuestasEstudiante || respuestasEstudiante.length === 0) {
      throw new NotFoundException(
        'No se recibieron respuestas para calificar.',
      );
    }

    await this.validarIntento(
      usuarioId,
      intentoId,
      origen,
      respuestasEstudiante,
    );

    const preguntaIds = respuestasEstudiante.map((r) => r.preguntaId);

    const preguntasConRespuestas = await this.prisma.pregunta.findMany({
      where: { id: { in: preguntaIds } },
      select: {
        id: true,
        enunciado: true,
        imagenUrl: true,
        explicacion: true,
        ordenEnCaso: true,
        caso: {
          select: {
            id: true,
            titulo: true,
            contexto: true,
            imagenUrl: true,
            area: true,
          },
        },
        respuestas: {
          select: {
            id: true,
            texto: true,
            explicacion: true,
            esCorrecta: true,
          },
        },
        subtema: { select: { tema: { select: { area: true } } } },
      },
    });

    const preguntaInfoPorId = new Map(
      preguntasConRespuestas.map((pregunta) => [
        pregunta.id,
        {
          area: pregunta.subtema.tema.area,
          pregunta,
        },
      ]),
    );

    if (preguntasConRespuestas.length !== preguntaIds.length) {
      throw new BadRequestException(
        'Una o más preguntas del intento ya no están disponibles.',
      );
    }
    for (const respuesta of respuestasEstudiante) {
      const pregunta = preguntaInfoPorId.get(respuesta.preguntaId)?.pregunta;
      if (
        !pregunta ||
        !pregunta.respuestas.some((item) => item.id === respuesta.respuestaId)
      ) {
        throw new BadRequestException(
          'Una respuesta seleccionada no pertenece a su pregunta.',
        );
      }
    }

    let correctas = 0;
    const detalle: DetalleRevision[] = [];
    const porArea: Record<string, { total: number; correctas: number }> = {};
    const sesionId = randomUUID();
    const historial: Prisma.HistorialRespuestaCreateManyInput[] = [];

    for (const respuestaAlumno of respuestasEstudiante) {
      const preguntaInfo = preguntaInfoPorId.get(respuestaAlumno.preguntaId);
      if (!preguntaInfo) continue;

      const revision = this.construirDetalleRevision(
        preguntaInfo.pregunta,
        respuestaAlumno.respuestaId,
      );
      if (revision.esCorrecto) correctas++;

      if (!porArea[preguntaInfo.area])
        porArea[preguntaInfo.area] = { total: 0, correctas: 0 };
      porArea[preguntaInfo.area].total++;
      if (revision.esCorrecto) porArea[preguntaInfo.area].correctas++;

      detalle.push(revision);
      if (revision.respuestaCorrectaId) {
        historial.push({
          sesionId,
          usuarioId,
          preguntaId: revision.preguntaId,
          respuestaSeleccionadaId: respuestaAlumno.respuestaId,
          respuestaCorrectaId: revision.respuestaCorrectaId,
          area: preguntaInfo.area,
          origen,
          esCorrecta: revision.esCorrecto,
          tiempoRespuestaSegundos:
            respuestaAlumno.tiempoRespuestaSegundos ?? null,
        });
      }
    }

    const totalPreguntas = respuestasEstudiante.length;
    const puntaje = Math.round((correctas / totalPreguntas) * 100 * 10) / 10;

    const xpGanado =
      correctas * 10 + (puntaje >= 80 ? 50 : puntaje >= 60 ? 25 : 0);

    const desglose: Array<{
      area: string;
      total: number;
      correctas: number;
      puntaje: number;
    }> = [];

    if (usuarioId) {
      const resultados = Object.entries(porArea).map(([area, stats]) => {
        const puntajeArea =
          Math.round((stats.correctas / stats.total) * 100 * 10) / 10;
        const xpArea = Math.round(xpGanado * (stats.total / totalPreguntas));

        return {
          usuarioId,
          area: area as AreaIcfes,
          totalPreguntas: stats.total,
          respuestasCorrectas: stats.correctas,
          puntaje: puntajeArea,
          xpGanado: xpArea,
        };
      });

      if (resultados.length > 0) {
        await this.prisma.$transaction(async (tx) => {
          await this.consumirIntento(tx, usuarioId, intentoId);
          await tx.resultadoSimulacro.createMany({ data: resultados });
          await tx.historialRespuesta.createMany({ data: historial });
          await tx.usuario.update({
            where: { id: usuarioId },
            data: { xpTotal: { increment: xpGanado } },
          });
        });
      }

      desglose.push(
        ...resultados.map((resultado) => ({
          area: resultado.area,
          total: resultado.totalPreguntas,
          correctas: resultado.respuestasCorrectas,
          puntaje: resultado.puntaje,
        })),
      );
    }

    return {
      mensaje:
        origen === OrigenRespuesta.ADAPTATIVO
          ? '¡Repaso inteligente completado!'
          : '¡Simulacro personalizado calificado!',
      resumen: {
        totalPreguntas,
        respuestasCorrectas: correctas,
        respuestasIncorrectas: totalPreguntas - correctas,
        puntaje: `${puntaje}%`,
        xpGanado,
      },
      desglose,
      detalle,
    };
  }

  // ─── HISTORIAL DE UN ESTUDIANTE ─────────────────────────────
  async obtenerHistorial(usuarioId: string) {
    const resultados = await this.prisma.resultadoSimulacro.findMany({
      where: { usuarioId },
      orderBy: { fechaRealizado: 'desc' },
      take: 20,
    });

    return {
      totalSimulacros: resultados.length,
      resultados,
    };
  }

  async obtenerHistorialRespuestas(
    usuarioId: string,
    area?: AreaIcfes,
    esCorrecta?: boolean,
    limite: number = 50,
  ) {
    const whereBase: Prisma.HistorialRespuestaWhereInput = {
      usuarioId,
      ...(area ? { area } : {}),
    };
    const whereRegistros: Prisma.HistorialRespuestaWhereInput = {
      ...whereBase,
      ...(esCorrecta !== undefined ? { esCorrecta } : {}),
    };
    const cantidad = Math.min(Math.max(limite, 1), 100);

    const [registros, total, correctas] = await Promise.all([
      this.prisma.historialRespuesta.findMany({
        where: whereRegistros,
        orderBy: { fechaRespuesta: 'desc' },
        take: cantidad,
        include: {
          pregunta: {
            select: {
              enunciado: true,
              explicacion: true,
              dificultad: true,
              caso: { select: { id: true, titulo: true } },
              subtema: {
                select: {
                  nombre: true,
                  tema: { select: { nombre: true } },
                },
              },
              respuestas: {
                select: {
                  id: true,
                  texto: true,
                  explicacion: true,
                  esCorrecta: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.historialRespuesta.count({ where: whereBase }),
      this.prisma.historialRespuesta.count({
        where: { ...whereBase, esCorrecta: true },
      }),
    ]);

    return {
      resumen: {
        total,
        correctas,
        incorrectas: total - correctas,
        porcentajeAciertos:
          total > 0 ? Math.round((correctas / total) * 1000) / 10 : 0,
      },
      respuestas: registros.map((registro) => {
        const seleccionada = registro.pregunta.respuestas.find(
          (respuesta) => respuesta.id === registro.respuestaSeleccionadaId,
        );
        const correcta = registro.pregunta.respuestas.find(
          (respuesta) => respuesta.id === registro.respuestaCorrectaId,
        );
        return {
          id: registro.id,
          sesionId: registro.sesionId,
          preguntaId: registro.preguntaId,
          enunciado: registro.pregunta.enunciado,
          explicacion: registro.pregunta.explicacion,
          dificultad: registro.pregunta.dificultad,
          area: registro.area,
          origen: registro.origen,
          esCorrecta: registro.esCorrecta,
          tiempoRespuestaSegundos: registro.tiempoRespuestaSegundos,
          fechaRespuesta: registro.fechaRespuesta,
          respuestaSeleccionada: seleccionada
            ? { id: seleccionada.id, texto: seleccionada.texto }
            : null,
          respuestaCorrecta: correcta
            ? {
                id: correcta.id,
                texto: correcta.texto,
                explicacion: correcta.explicacion,
              }
            : null,
          tema: registro.pregunta.subtema.tema.nombre,
          subtema: registro.pregunta.subtema.nombre,
          caso: registro.pregunta.caso,
        };
      }),
    };
  }

  async obtenerPreguntasPorSubtema(usuarioId: string, subtemaId: string) {
    const preguntas = await this.prisma.pregunta.findMany({
      where: preguntaPublicadaWhere({ subtemaId }),
      select: {
        id: true,
        enunciado: true,
        imagenUrl: true,
        dificultad: true,
        ordenEnCaso: true,
        caso: {
          select: {
            id: true,
            titulo: true,
            contexto: true,
            imagenUrl: true,
            area: true,
          },
        },
        respuestas: {
          select: { id: true, texto: true },
        },
        subtema: {
          select: {
            nombre: true,
            tema: {
              select: { nombre: true, area: true },
            },
          },
        },
      },
      orderBy: [{ casoId: 'asc' }, { ordenEnCaso: 'asc' }, { id: 'asc' }],
    });
    if (preguntas.length === 0) {
      throw new NotFoundException('No hay preguntas disponibles para el tema.');
    }
    const seleccionadas = this.seleccionarPreguntasAgrupadas(preguntas, 5);
    const area = seleccionadas[0].subtema.tema.area;
    const intento = await this.crearIntento(
      usuarioId,
      OrigenRespuesta.PRACTICA,
      seleccionadas.map((pregunta) => pregunta.id),
      area,
    );
    return { intentoId: intento.id, preguntas: seleccionadas };
  }

  // Retired even in development: HTTP demo seeding bypassed editorial rules.
  poblarBaseDeDatos(): never {
    throw new GoneException({
      statusCode: 410,
      code: 'LEGACY_EDITORIAL_WRITE_RETIRED',
      message:
        'La carga de datos de prueba por HTTP fue retirada. Usa la demo aislada del panel o crea borradores mediante el editor ADMIN.',
      replacement: 'POST /admin/editor/preguntas',
    });
  }
  async obtenerTemasPorArea(area: AreaIcfes) {
    const temas = await this.prisma.tema.findMany({
      where: temaPublicadoWhere({
        area,
        subtemas: { some: { estadoContenido: ESTADO_PUBLICADO } },
      }),
      include: {
        subtemas: {
          where: { estadoContenido: ESTADO_PUBLICADO },
          include: {
            preguntas: {
              where: preguntaPublicadaWhere(),
              select: { id: true },
            },
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    return {
      area,
      temas: temas.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        subtemas: t.subtemas.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          totalPreguntas: s.preguntas.length,
          contenido: s.contenido,
          videoUrl: s.videoUrl,
          imagenUrl: s.imagenUrl,
          tipoInteractivo: s.tipoInteractivo,
          datosInteractivo: s.datosInteractivo,
        })),
      })),
    };
  }

  // ─── MARCAR TEMA COMO VISTO/COMPLETADO ─────────────────────
  async actualizarProgresoTema(
    usuarioId: string,
    subtemaId: string,
    porcentaje: number,
  ) {
    const completado = porcentaje >= 100;

    await this.prisma.progresoTema.upsert({
      where: {
        usuarioId_subtemaId: { usuarioId, subtemaId },
      },
      update: { porcentaje, completado, fechaVisto: new Date() },
      create: { usuarioId, subtemaId, porcentaje, completado },
    });

    return { mensaje: 'Progreso actualizado', porcentaje, completado };
  }

  // ─── OBTENER PROGRESO GENERAL DEL ESTUDIANTE ───────────────
  async obtenerProgresoGeneral(usuarioId: string) {
    const todoLosSubtemas = await this.prisma.subtema.count({
      where: subtemaPublicadoWhere(),
    });

    const progresos = await this.prisma.progresoTema.findMany({
      where: {
        usuarioId,
        subtema: {
          estadoContenido: ESTADO_PUBLICADO,
          tema: { estadoContenido: ESTADO_PUBLICADO },
        },
      },
      include: {
        subtema: {
          include: {
            tema: { select: { area: true, nombre: true } },
          },
        },
      },
    });

    const temasVistos = progresos.length;

    const temasCompletados = progresos.filter((p) => p.completado).length;
    const porcentajeGeneral =
      todoLosSubtemas > 0
        ? Math.round((temasCompletados / todoLosSubtemas) * 100)
        : 0;

    // Progreso por área
    const porArea: Record<
      string,
      { vistos: number; completados: number; total: number }
    > = {};

    progresos.forEach((p) => {
      const area = p.subtema.tema.area;

      if (!porArea[area])
        porArea[area] = { vistos: 0, completados: 0, total: 0 };

      porArea[area].vistos++;

      if (p.completado) porArea[area].completados++;
    });

    // Progreso por subtema (para el menú lateral)
    const porSubtema: Record<string, number> = {};

    progresos.forEach((p) => {
      porSubtema[p.subtemaId] = p.porcentaje;
    });

    return {
      totalSubtemas: todoLosSubtemas,

      temasVistos,

      temasCompletados,
      porcentajeGeneral,
      porArea,
      porSubtema,
    };
  }
}
