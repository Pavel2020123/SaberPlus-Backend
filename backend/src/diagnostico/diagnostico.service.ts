import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AreaIcfes,
  NivelDiagnostico,
  OrigenRespuesta,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { preguntaPublicadaWhere } from '../common/contenido-publicado';

const AREAS_DIAGNOSTICO: AreaIcfes[] = [
  AreaIcfes.LECTURA_CRITICA,
  AreaIcfes.MATEMATICAS,
  AreaIcfes.CIENCIAS_NATURALES,
  AreaIcfes.SOCIALES_CIUDADANAS,
  AreaIcfes.INGLES,
];

const PREGUNTAS_POR_AREA = 3;

const NOMBRES_AREAS: Record<AreaIcfes, string> = {
  [AreaIcfes.LECTURA_CRITICA]: 'Lectura Crítica',
  [AreaIcfes.MATEMATICAS]: 'Matemáticas',
  [AreaIcfes.CIENCIAS_NATURALES]: 'Ciencias Naturales',
  [AreaIcfes.SOCIALES_CIUDADANAS]: 'Sociales y Ciudadanas',
  [AreaIcfes.INGLES]: 'Inglés',
};

const preguntaPublicaSelect = Prisma.validator<Prisma.PreguntaSelect>()({
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
      tema: { select: { nombre: true, area: true } },
    },
  },
});

type DiagnosticoConAreas = Prisma.DiagnosticoInicialGetPayload<{
  include: { resultadosPorArea: true };
}>;

interface RespuestaEstudiante {
  preguntaId: string;
  respuestaId: string;
  tiempoRespuestaSegundos?: number;
}

@Injectable()
export class DiagnosticoService {
  constructor(private readonly prisma: PrismaService) {}

  private mezclar<T>(elementos: T[]): T[] {
    const copia = [...elementos];
    for (let i = copia.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
  }

  private nivelPara(porcentaje: number): NivelDiagnostico {
    if (porcentaje >= 70) return NivelDiagnostico.FORTALEZA;
    if (porcentaje >= 50) return NivelDiagnostico.EN_PROCESO;
    return NivelDiagnostico.POR_REFORZAR;
  }

  private extraerPreguntaIds(valor: Prisma.JsonValue): string[] {
    if (!Array.isArray(valor)) return [];
    return valor.filter((id): id is string => typeof id === 'string');
  }

  private async validarEstudiante(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });
    if (!usuario) throw new NotFoundException('El usuario no existe.');
    if (usuario.rol !== 'ESTUDIANTE') {
      throw new ForbiddenException(
        'El diagnóstico inicial está disponible para estudiantes.',
      );
    }
  }

  private ordenarResultados<T extends { area: AreaIcfes }>(resultados: T[]) {
    return [...resultados].sort(
      (a, b) =>
        AREAS_DIAGNOSTICO.indexOf(a.area) - AREAS_DIAGNOSTICO.indexOf(b.area),
    );
  }

  private construirResultado(diagnostico: DiagnosticoConAreas) {
    const resultadosPorArea = this.ordenarResultados(
      diagnostico.resultadosPorArea,
    );
    const porDesempeno = [...resultadosPorArea].sort((a, b) => {
      if (a.porcentaje !== b.porcentaje) return a.porcentaje - b.porcentaje;
      return (
        AREAS_DIAGNOSTICO.indexOf(a.area) - AREAS_DIAGNOSTICO.indexOf(b.area)
      );
    });

    return {
      estado: 'COMPLETADO' as const,
      diagnosticoId: diagnostico.id,
      iniciadoEn: diagnostico.iniciadoEn,
      completadoEn: diagnostico.completadoEn,
      totalPreguntas: diagnostico.totalPreguntas,
      respuestasCorrectas: diagnostico.respuestasCorrectas ?? 0,
      porcentaje: diagnostico.porcentaje ?? 0,
      nivel: diagnostico.nivel ?? NivelDiagnostico.POR_REFORZAR,
      resultadosPorArea,
      areaPrioritaria: porDesempeno[0]?.area ?? null,
      areaFortaleza: porDesempeno[porDesempeno.length - 1]?.area ?? null,
    };
  }

  private async obtenerPreguntasPublicas(ids: string[]) {
    const preguntas = await this.prisma.pregunta.findMany({
      where: { id: { in: ids } },
      select: preguntaPublicaSelect,
    });
    const porId = new Map(preguntas.map((pregunta) => [pregunta.id, pregunta]));
    return ids
      .map((id) => porId.get(id))
      .filter((pregunta) => pregunta != null);
  }

  async obtenerEstado(usuarioId: string) {
    await this.validarEstudiante(usuarioId);
    const diagnostico = await this.prisma.diagnosticoInicial.findUnique({
      where: { usuarioId },
      include: { resultadosPorArea: true },
    });

    if (!diagnostico) return { estado: 'NO_INICIADO' as const };
    if (diagnostico.completadoEn) return this.construirResultado(diagnostico);

    const preguntaIds = this.extraerPreguntaIds(diagnostico.preguntaIds);
    const preguntas = await this.obtenerPreguntasPublicas(preguntaIds);
    if (preguntas.length !== preguntaIds.length) {
      throw new BadRequestException(
        'El banco de preguntas cambió y este diagnóstico no puede reanudarse. Contacta al administrador.',
      );
    }

    return {
      estado: 'EN_PROGRESO' as const,
      diagnosticoId: diagnostico.id,
      iniciadoEn: diagnostico.iniciadoEn,
      totalPreguntas: preguntas.length,
      preguntas,
    };
  }

  async iniciar(usuarioId: string) {
    await this.validarEstudiante(usuarioId);
    const existente = await this.prisma.diagnosticoInicial.findUnique({
      where: { usuarioId },
      select: { id: true },
    });
    if (existente) return this.obtenerEstado(usuarioId);

    const grupos = await Promise.all(
      AREAS_DIAGNOSTICO.map(async (area) => {
        const preguntas = await this.prisma.pregunta.findMany({
          where: preguntaPublicadaWhere({ subtema: { tema: { area } } }),
          select: preguntaPublicaSelect,
        });
        if (preguntas.length < PREGUNTAS_POR_AREA) {
          throw new NotFoundException(
            `Se necesitan al menos ${PREGUNTAS_POR_AREA} preguntas en ${NOMBRES_AREAS[area]} para iniciar el diagnóstico. Actualmente hay ${preguntas.length}.`,
          );
        }
        return this.mezclar(preguntas).slice(0, PREGUNTAS_POR_AREA);
      }),
    );

    const seleccionadas = Array.from(
      { length: PREGUNTAS_POR_AREA },
      (_, indice) => grupos.map((grupo) => grupo[indice]).filter(Boolean),
    ).flat();
    const preguntaIds = seleccionadas.map((pregunta) => pregunta.id);

    await this.prisma.diagnosticoInicial.create({
      data: {
        usuarioId,
        preguntaIds,
        totalPreguntas: preguntaIds.length,
      },
    });

    return this.obtenerEstado(usuarioId);
  }

  async finalizar(usuarioId: string, respuestas: RespuestaEstudiante[]) {
    await this.validarEstudiante(usuarioId);
    const diagnostico = await this.prisma.diagnosticoInicial.findUnique({
      where: { usuarioId },
      include: { resultadosPorArea: true },
    });
    if (!diagnostico) {
      throw new BadRequestException('Primero debes iniciar el diagnóstico.');
    }
    if (diagnostico.completadoEn) return this.construirResultado(diagnostico);

    const preguntaIds = this.extraerPreguntaIds(diagnostico.preguntaIds);
    const respuestasPorPregunta = new Map(
      respuestas.map((respuesta) => [respuesta.preguntaId, respuesta]),
    );
    if (
      respuestasPorPregunta.size !== preguntaIds.length ||
      respuestas.length !== preguntaIds.length ||
      preguntaIds.some((id) => !respuestasPorPregunta.has(id))
    ) {
      throw new BadRequestException(
        'Debes responder todas las preguntas del diagnóstico antes de finalizar.',
      );
    }

    const preguntas = await this.prisma.pregunta.findMany({
      where: { id: { in: preguntaIds } },
      select: {
        id: true,
        respuestas: { select: { id: true, esCorrecta: true } },
        subtema: { select: { tema: { select: { area: true } } } },
      },
    });
    if (preguntas.length !== preguntaIds.length) {
      throw new BadRequestException(
        'Una de las preguntas del diagnóstico ya no está disponible.',
      );
    }

    const acumulado = new Map<
      AreaIcfes,
      { totalPreguntas: number; respuestasCorrectas: number }
    >();
    const historial: Prisma.HistorialRespuestaCreateManyInput[] = [];
    let respuestasCorrectas = 0;

    for (const pregunta of preguntas) {
      const respuestaEstudiante = respuestasPorPregunta.get(pregunta.id);
      const seleccionada = pregunta.respuestas.find(
        (respuesta) => respuesta.id === respuestaEstudiante.respuestaId,
      );
      const correcta = pregunta.respuestas.find(
        (respuesta) => respuesta.esCorrecta,
      );
      if (!seleccionada || !correcta) {
        throw new BadRequestException(
          'Una respuesta enviada no pertenece a la pregunta indicada.',
        );
      }

      const area = pregunta.subtema.tema.area;
      const esCorrecta = seleccionada.id === correcta.id;
      if (esCorrecta) respuestasCorrectas += 1;
      const resumenArea = acumulado.get(area) ?? {
        totalPreguntas: 0,
        respuestasCorrectas: 0,
      };
      resumenArea.totalPreguntas += 1;
      if (esCorrecta) resumenArea.respuestasCorrectas += 1;
      acumulado.set(area, resumenArea);

      historial.push({
        sesionId: diagnostico.id,
        usuarioId,
        preguntaId: pregunta.id,
        respuestaSeleccionadaId: seleccionada.id,
        respuestaCorrectaId: correcta.id,
        area,
        origen: OrigenRespuesta.DIAGNOSTICO,
        esCorrecta,
        tiempoRespuestaSegundos:
          respuestaEstudiante.tiempoRespuestaSegundos ?? null,
      });
    }

    const porcentaje =
      Math.round((respuestasCorrectas / preguntaIds.length) * 1000) / 10;
    const resultadosPorArea = this.ordenarResultados(
      [...acumulado.entries()].map(([area, resultado]) => {
        const porcentajeArea =
          Math.round(
            (resultado.respuestasCorrectas / resultado.totalPreguntas) * 1000,
          ) / 10;
        return {
          diagnosticoId: diagnostico.id,
          area,
          ...resultado,
          porcentaje: porcentajeArea,
          nivel: this.nivelPara(porcentajeArea),
        };
      }),
    );

    await this.prisma.$transaction([
      this.prisma.diagnosticoResultadoArea.createMany({
        data: resultadosPorArea,
      }),
      this.prisma.diagnosticoInicial.update({
        where: { id: diagnostico.id },
        data: {
          completadoEn: new Date(),
          respuestasCorrectas,
          porcentaje,
          nivel: this.nivelPara(porcentaje),
        },
      }),
      this.prisma.historialRespuesta.createMany({ data: historial }),
    ]);

    return this.obtenerEstado(usuarioId);
  }
}
