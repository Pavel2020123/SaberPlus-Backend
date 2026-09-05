import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AreaIcfes,
  Dificultad,
  OrigenRespuesta,
  RolUsuario,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SimulacroService } from './simulacro.service';
import { preguntaPublicadaWhere } from '../common/contenido-publicado';

const AREAS = Object.values(AreaIcfes);
const DIFICULTADES = [Dificultad.BASICO, Dificultad.MEDIO, Dificultad.AVANZADO];

type Estadistica = { total: number; correctas: number };

interface RespuestaAdaptativa {
  preguntaId: string;
  respuestaId: string;
  tiempoRespuestaSegundos?: number;
}

interface RegistroHistorial {
  preguntaId: string;
  area: AreaIcfes;
  esCorrecta: boolean;
  fechaRespuesta: Date;
  pregunta: {
    dificultad: Dificultad;
    subtemaId: string;
  };
}

interface Candidato {
  id: string;
  dificultad: Dificultad;
  ordenEnCaso: number | null;
  caso: { id: string } | null;
  subtema: {
    id: string;
    tema: { area: AreaIcfes };
  };
}

interface GrupoCandidatos<T extends Candidato> {
  preguntas: T[];
  dificultad: Dificultad;
  puntaje: number;
}

@Injectable()
export class RepasoAdaptativoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly simulacros: SimulacroService,
  ) {}

  async obtenerPerfil(usuarioId: string) {
    await this.asegurarEstudiante(usuarioId);
    const historial = await this.obtenerHistorial(usuarioId);
    return this.construirPerfil(historial);
  }

  async generar(usuarioId: string, cantidad: number = 15) {
    await this.asegurarEstudiante(usuarioId);
    const [historial, candidatos] = await Promise.all([
      this.obtenerHistorial(usuarioId),
      this.prisma.pregunta.findMany({
        where: preguntaPublicadaWhere(),
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
          respuestas: { select: { id: true, texto: true } },
          subtema: {
            select: {
              id: true,
              nombre: true,
              tema: { select: { nombre: true, area: true } },
            },
          },
        },
      }),
    ]);

    if (candidatos.length === 0) {
      throw new NotFoundException(
        'No hay preguntas disponibles para preparar el repaso inteligente.',
      );
    }

    const perfil = this.construirPerfil(historial);
    const seleccionadas = this.seleccionar(
      candidatos,
      historial,
      perfil.nivelObjetivo,
      Math.min(Math.max(cantidad, 5), 30),
    );
    const intento = await this.prisma.intentoSimulacro.create({
      data: {
        usuarioId,
        origen: OrigenRespuesta.ADAPTATIVO,
        preguntaIds: seleccionadas.map((pregunta) => pregunta.id),
        expira: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    });

    return {
      intentoId: intento.id,
      totalPreguntas: seleccionadas.length,
      adaptacion: {
        nivelObjetivo: perfil.nivelObjetivo,
        precisionReciente: perfil.precisionReciente,
        areasPrioritarias: perfil.areasPrioritarias,
        mezcla: this.contarDificultades(seleccionadas),
      },
      preguntas: seleccionadas,
    };
  }

  async calificar(
    usuarioId: string,
    intentoId: string,
    respuestas: RespuestaAdaptativa[],
  ) {
    await this.asegurarEstudiante(usuarioId);
    const resultado = await this.simulacros.calificarRepasoAdaptativo(
      usuarioId,
      intentoId,
      respuestas,
    );
    const perfilSiguiente = await this.obtenerPerfil(usuarioId);
    return { ...resultado, perfilSiguiente };
  }

  private async obtenerHistorial(usuarioId: string) {
    return this.prisma.historialRespuesta.findMany({
      where: { usuarioId },
      orderBy: { fechaRespuesta: 'desc' },
      take: 300,
      select: {
        preguntaId: true,
        area: true,
        esCorrecta: true,
        fechaRespuesta: true,
        pregunta: { select: { dificultad: true, subtemaId: true } },
      },
    });
  }

  private construirPerfil(historial: RegistroHistorial[]) {
    const porArea = new Map<AreaIcfes, Estadistica>();
    for (const area of AREAS) porArea.set(area, { total: 0, correctas: 0 });
    for (const registro of historial) {
      const estadistica = porArea.get(registro.area);
      if (!estadistica) continue;
      estadistica.total++;
      if (registro.esCorrecta) estadistica.correctas++;
    }

    const total = historial.length;
    const correctas = historial.filter(
      (registro) => registro.esCorrecta,
    ).length;
    const precisionReciente = total
      ? Math.round((correctas / total) * 1000) / 10
      : null;
    const nivelObjetivo = this.nivelSegunPrecision(precisionReciente, total);
    const rendimientoPorArea = AREAS.map((area) => {
      const estadistica = porArea.get(area) ?? { total: 0, correctas: 0 };
      const precision = estadistica.total
        ? Math.round((estadistica.correctas / estadistica.total) * 1000) / 10
        : null;
      return {
        area,
        intentos: estadistica.total,
        precision,
        prioridad: precision === null ? 55 : Math.round(100 - precision),
      };
    }).sort((a, b) => b.prioridad - a.prioridad || b.intentos - a.intentos);

    return {
      intentosAnalizados: total,
      precisionReciente,
      nivelObjetivo,
      rendimientoPorArea,
      areasPrioritarias: rendimientoPorArea
        .slice(0, 3)
        .map((area) => area.area),
      mezclaRecomendada: this.mezclaPara(nivelObjetivo),
    };
  }

  private seleccionar<T extends Candidato>(
    candidatos: T[],
    historial: RegistroHistorial[],
    nivelObjetivo: Dificultad,
    cantidad: number,
  ) {
    const porPregunta = new Map<string, Estadistica>();
    const porSubtema = new Map<string, Estadistica>();
    const ultimoIntento = new Map<string, RegistroHistorial>();

    for (const registro of historial) {
      this.acumular(porPregunta, registro.preguntaId, registro.esCorrecta);
      this.acumular(
        porSubtema,
        registro.pregunta.subtemaId,
        registro.esCorrecta,
      );
      if (!ultimoIntento.has(registro.preguntaId)) {
        ultimoIntento.set(registro.preguntaId, registro);
      }
    }

    const estadisticasArea = new Map<AreaIcfes, Estadistica>();
    for (const registro of historial) {
      this.acumular(estadisticasArea, registro.area, registro.esCorrecta);
    }
    const ahora = Date.now();
    const puntuar = (pregunta: T) => {
      const area = estadisticasArea.get(pregunta.subtema.tema.area);
      const subtema = porSubtema.get(pregunta.subtema.id);
      const propia = porPregunta.get(pregunta.id);
      const ultimo = ultimoIntento.get(pregunta.id);
      const debilidadArea = area ? 1 - area.correctas / area.total : 0.55;
      const debilidadSubtema = subtema
        ? 1 - subtema.correctas / subtema.total
        : 0.58;
      const debilidadPropia = propia
        ? 1 - propia.correctas / propia.total
        : 0.5;
      const distancia = Math.abs(
        DIFICULTADES.indexOf(pregunta.dificultad) -
          DIFICULTADES.indexOf(nivelObjetivo),
      );
      const ajusteNivel = distancia === 0 ? 24 : distancia === 1 ? 9 : 0;
      const diasDesdeUltimo = ultimo
        ? (ahora - ultimo.fechaRespuesta.getTime()) / 86_400_000
        : null;
      const ajusteRecencia =
        ultimo?.esCorrecta && diasDesdeUltimo !== null && diasDesdeUltimo < 3
          ? -28
          : ultimo && !ultimo.esCorrecta
            ? 14
            : propia
              ? 0
              : 12;

      return (
        debilidadArea * 34 +
        debilidadSubtema * 42 +
        debilidadPropia * 20 +
        ajusteNivel +
        ajusteRecencia +
        Math.random() * 5
      );
    };

    const grupos = new Map<string, T[]>();
    for (const pregunta of candidatos) {
      const clave = pregunta.caso ? `caso:${pregunta.caso.id}` : pregunta.id;
      grupos.set(clave, [...(grupos.get(clave) ?? []), pregunta]);
    }
    const gruposPuntuados: GrupoCandidatos<T>[] = [...grupos.values()].map(
      (preguntas) => ({
        preguntas: preguntas.sort(
          (a, b) =>
            (a.ordenEnCaso ?? Number.MAX_SAFE_INTEGER) -
            (b.ordenEnCaso ?? Number.MAX_SAFE_INTEGER),
        ),
        dificultad: preguntas[0].dificultad,
        puntaje:
          preguntas.reduce((suma, pregunta) => suma + puntuar(pregunta), 0) /
          preguntas.length,
      }),
    );
    const mezcla = this.mezclaPara(nivelObjetivo);
    const seleccionadas: T[] = [];
    const elegidos = new Set<GrupoCandidatos<T>>();

    for (const dificultad of DIFICULTADES) {
      const objetivo = Math.round((cantidad * mezcla[dificultad]) / 100);
      const opciones = gruposPuntuados
        .filter((grupo) => grupo.dificultad === dificultad)
        .sort((a, b) => b.puntaje - a.puntaje);
      let agregadas = 0;
      for (const grupo of opciones) {
        if (agregadas >= objetivo) break;
        if (seleccionadas.length + grupo.preguntas.length > cantidad) continue;
        seleccionadas.push(...grupo.preguntas);
        elegidos.add(grupo);
        agregadas += grupo.preguntas.length;
      }
    }

    for (const grupo of gruposPuntuados.sort((a, b) => b.puntaje - a.puntaje)) {
      if (seleccionadas.length >= cantidad) break;
      if (elegidos.has(grupo)) continue;
      if (seleccionadas.length + grupo.preguntas.length > cantidad) continue;
      seleccionadas.push(...grupo.preguntas);
    }

    if (seleccionadas.length === 0 && gruposPuntuados[0]) {
      seleccionadas.push(...gruposPuntuados[0].preguntas);
    }
    return seleccionadas;
  }

  private acumular<K>(mapa: Map<K, Estadistica>, clave: K, correcta: boolean) {
    const estadistica = mapa.get(clave) ?? { total: 0, correctas: 0 };
    estadistica.total++;
    if (correcta) estadistica.correctas++;
    mapa.set(clave, estadistica);
  }

  private nivelSegunPrecision(precision: number | null, intentos: number) {
    if (precision === null || intentos < 8) return Dificultad.MEDIO;
    if (precision < 50) return Dificultad.BASICO;
    if (precision < 79) return Dificultad.MEDIO;
    return Dificultad.AVANZADO;
  }

  private mezclaPara(nivel: Dificultad): Record<Dificultad, number> {
    if (nivel === Dificultad.BASICO) {
      return { BASICO: 70, MEDIO: 30, AVANZADO: 0 };
    }
    if (nivel === Dificultad.AVANZADO) {
      return { BASICO: 10, MEDIO: 35, AVANZADO: 55 };
    }
    return { BASICO: 25, MEDIO: 60, AVANZADO: 15 };
  }

  private contarDificultades(preguntas: Candidato[]) {
    return DIFICULTADES.reduce(
      (conteo, dificultad) => ({
        ...conteo,
        [dificultad]: preguntas.filter(
          (pregunta) => pregunta.dificultad === dificultad,
        ).length,
      }),
      {} as Record<Dificultad, number>,
    );
  }

  private async asegurarEstudiante(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });
    if (usuario?.rol !== RolUsuario.ESTUDIANTE) {
      throw new ForbiddenException(
        'El repaso inteligente está disponible para estudiantes.',
      );
    }
  }
}
