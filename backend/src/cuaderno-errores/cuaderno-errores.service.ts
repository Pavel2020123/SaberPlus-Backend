import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AreaIcfes, EstadoCuadernoError, RolUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface FiltrosCuaderno {
  area?: AreaIcfes;
  estado?: EstadoCuadernoError;
}

interface CambiosCuaderno {
  nota?: string;
  estado?: EstadoCuadernoError;
}

@Injectable()
export class CuadernoErroresService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(usuarioId: string, filtros: FiltrosCuaderno = {}) {
    await this.asegurarEstudiante(usuarioId);

    const grupos = await this.prisma.historialRespuesta.groupBy({
      by: ['preguntaId'],
      where: {
        usuarioId,
        esCorrecta: false,
        ...(filtros.area ? { area: filtros.area } : {}),
      },
      _count: { preguntaId: true },
      _max: { fechaRespuesta: true },
      orderBy: { _max: { fechaRespuesta: 'desc' } },
    });

    const preguntaIds = grupos.map((grupo) => grupo.preguntaId);
    if (preguntaIds.length === 0) {
      return {
        resumen: { total: 0, pendientes: 0, repasando: 0, dominados: 0 },
        errores: [],
      };
    }

    const [ultimosErrores, metadatos] = await Promise.all([
      this.prisma.historialRespuesta.findMany({
        where: {
          usuarioId,
          esCorrecta: false,
          preguntaId: { in: preguntaIds },
        },
        orderBy: { fechaRespuesta: 'desc' },
        distinct: ['preguntaId'],
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
      this.prisma.cuadernoError.findMany({
        where: { usuarioId, preguntaId: { in: preguntaIds } },
      }),
    ]);

    const conteos = new Map(
      grupos.map((grupo) => [grupo.preguntaId, grupo._count.preguntaId]),
    );
    const metadatosPorPregunta = new Map(
      metadatos.map((registro) => [registro.preguntaId, registro]),
    );

    const todos = ultimosErrores.map((registro) => {
      const seleccionada = registro.pregunta.respuestas.find(
        (respuesta) => respuesta.id === registro.respuestaSeleccionadaId,
      );
      const correcta = registro.pregunta.respuestas.find(
        (respuesta) => respuesta.id === registro.respuestaCorrectaId,
      );
      const metadato = metadatosPorPregunta.get(registro.preguntaId);
      const estado = this.estadoEfectivo(
        metadato?.estado,
        metadato?.dominadoEn,
        registro.fechaRespuesta,
      );

      return {
        preguntaId: registro.preguntaId,
        enunciado: registro.pregunta.enunciado,
        explicacion: registro.pregunta.explicacion,
        dificultad: registro.pregunta.dificultad,
        area: registro.area,
        origenUltimo: registro.origen,
        vecesFallada: conteos.get(registro.preguntaId) ?? 1,
        ultimoErrorEn: registro.fechaRespuesta,
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
        nota: metadato?.nota ?? '',
        estado,
        actualizadoEn: metadato?.fechaActualizacion ?? null,
      };
    });

    const resumen = {
      total: todos.length,
      pendientes: todos.filter(
        (error) => error.estado === EstadoCuadernoError.PENDIENTE,
      ).length,
      repasando: todos.filter(
        (error) => error.estado === EstadoCuadernoError.REPASANDO,
      ).length,
      dominados: todos.filter(
        (error) => error.estado === EstadoCuadernoError.DOMINADO,
      ).length,
    };

    return {
      resumen,
      errores: filtros.estado
        ? todos.filter((error) => error.estado === filtros.estado)
        : todos,
    };
  }

  async actualizar(
    usuarioId: string,
    preguntaId: string,
    cambios: CambiosCuaderno,
  ) {
    await this.asegurarEstudiante(usuarioId);
    if (cambios.nota === undefined && cambios.estado === undefined) {
      throw new BadRequestException('No hay cambios para guardar.');
    }

    const errorReal = await this.prisma.historialRespuesta.findFirst({
      where: { usuarioId, preguntaId, esCorrecta: false },
      select: { preguntaId: true },
    });
    if (!errorReal) {
      throw new NotFoundException(
        'Esta pregunta no pertenece a tu cuaderno de errores.',
      );
    }

    const nota = cambios.nota?.trim() ?? undefined;
    const dominadoEn =
      cambios.estado === EstadoCuadernoError.DOMINADO
        ? new Date()
        : cambios.estado
          ? null
          : undefined;
    const registro = await this.prisma.cuadernoError.upsert({
      where: { usuarioId_preguntaId: { usuarioId, preguntaId } },
      create: {
        usuarioId,
        preguntaId,
        nota: nota ?? '',
        estado: cambios.estado ?? EstadoCuadernoError.PENDIENTE,
        dominadoEn,
      },
      update: {
        ...(cambios.nota !== undefined ? { nota: nota ?? '' } : {}),
        ...(cambios.estado !== undefined
          ? { estado: cambios.estado, dominadoEn }
          : {}),
      },
      select: {
        preguntaId: true,
        nota: true,
        estado: true,
        dominadoEn: true,
        fechaActualizacion: true,
      },
    });

    return { ...registro, nota: registro.nota ?? '' };
  }

  private estadoEfectivo(
    estado: EstadoCuadernoError | undefined,
    dominadoEn: Date | null | undefined,
    ultimoErrorEn: Date,
  ) {
    if (
      estado === EstadoCuadernoError.DOMINADO &&
      dominadoEn &&
      dominadoEn >= ultimoErrorEn
    ) {
      return EstadoCuadernoError.DOMINADO;
    }
    if (estado === EstadoCuadernoError.DOMINADO) {
      return EstadoCuadernoError.REPASANDO;
    }
    return estado ?? EstadoCuadernoError.PENDIENTE;
  }

  private async asegurarEstudiante(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });
    if (usuario?.rol !== RolUsuario.ESTUDIANTE) {
      throw new ForbiddenException(
        'El cuaderno de errores está disponible para estudiantes.',
      );
    }
  }
}
