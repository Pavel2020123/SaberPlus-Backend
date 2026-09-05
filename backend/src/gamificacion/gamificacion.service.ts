import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ZONA_HORARIA = 'America/Bogota';
const DIA_MS = 86_400_000;

export interface RachaCalculada {
  actual: number;
  mejor: number;
  activoHoy: boolean;
  ultimaActividad: string | null;
}

interface MetricaLogro {
  preguntas: number;
  correctas: number;
  simulacros: number;
  temas: number;
  areas: number;
  puntajePerfecto: number;
  racha: number;
  batallas: number;
  victoriasBatalla: number;
  rachaVictorias: number;
  victoriasPerfectas: number;
}

const DEFINICIONES = [
  {
    id: 'PRIMER_PASO',
    titulo: 'Primer paso',
    descripcion: 'Responde tu primera pregunta.',
    categoria: 'PRACTICA',
    metrica: 'preguntas',
    meta: 1,
  },
  {
    id: 'MENTE_ACTIVA',
    titulo: 'Mente activa',
    descripcion: 'Responde 25 preguntas.',
    categoria: 'PRACTICA',
    metrica: 'preguntas',
    meta: 25,
  },
  {
    id: 'CENTENAR',
    titulo: 'Cien preguntas',
    descripcion: 'Responde 100 preguntas.',
    categoria: 'PRACTICA',
    metrica: 'preguntas',
    meta: 100,
  },
  {
    id: 'BUENA_PUNTERIA',
    titulo: 'Buena puntería',
    descripcion: 'Acumula 50 respuestas correctas.',
    categoria: 'PRECISION',
    metrica: 'correctas',
    meta: 50,
  },
  {
    id: 'PRIMER_SIMULACRO',
    titulo: 'Primer simulacro',
    descripcion: 'Completa tu primer simulacro.',
    categoria: 'SIMULACROS',
    metrica: 'simulacros',
    meta: 1,
  },
  {
    id: 'CONSTANCIA',
    titulo: 'Constancia',
    descripcion: 'Completa 5 simulacros.',
    categoria: 'SIMULACROS',
    metrica: 'simulacros',
    meta: 5,
  },
  {
    id: 'IMPECABLE',
    titulo: 'Impecable',
    descripcion: 'Obtiene 100% en un simulacro.',
    categoria: 'PRECISION',
    metrica: 'puntajePerfecto',
    meta: 1,
  },
  {
    id: 'EXPLORADOR',
    titulo: 'Explorador',
    descripcion: 'Practica en las cinco áreas del examen.',
    categoria: 'PRACTICA',
    metrica: 'areas',
    meta: 5,
  },
  {
    id: 'TEMA_DOMINADO',
    titulo: 'Tema dominado',
    descripcion: 'Completa tu primer tema.',
    categoria: 'ESTUDIO',
    metrica: 'temas',
    meta: 1,
  },
  {
    id: 'ESTUDIANTE_DEDICADO',
    titulo: 'Estudiante dedicado',
    descripcion: 'Completa 10 temas.',
    categoria: 'ESTUDIO',
    metrica: 'temas',
    meta: 10,
  },
  {
    id: 'RACHA_3',
    titulo: 'En marcha',
    descripcion: 'Mantén una racha de 3 días.',
    categoria: 'RACHA',
    metrica: 'racha',
    meta: 3,
  },
  {
    id: 'RACHA_7',
    titulo: 'Semana completa',
    descripcion: 'Alcanza una racha de 7 días.',
    categoria: 'RACHA',
    metrica: 'racha',
    meta: 7,
  },
  {
    id: 'PRIMERA_VICTORIA',
    titulo: 'Primera victoria',
    descripcion: 'Gana tu primera batalla asincrona.',
    categoria: 'BATALLAS',
    metrica: 'victoriasBatalla',
    meta: 1,
  },
  {
    id: 'RACHA_BATALLA_3',
    titulo: 'Imparable',
    descripcion: 'Consigue una racha de 3 victorias.',
    categoria: 'BATALLAS',
    metrica: 'rachaVictorias',
    meta: 3,
  },
  {
    id: 'VETERANO_BATALLA',
    titulo: 'Veterano de batalla',
    descripcion: 'Gana 10 batallas.',
    categoria: 'BATALLAS',
    metrica: 'victoriasBatalla',
    meta: 10,
  },
  {
    id: 'VICTORIA_PERFECTA',
    titulo: 'Victoria perfecta',
    descripcion: 'Gana una batalla sin fallar.',
    categoria: 'BATALLAS',
    metrica: 'victoriasPerfectas',
    meta: 1,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  metrica: keyof MetricaLogro;
  meta: number;
}>;

export function claveDia(fecha: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(fecha);
}

function numeroDia(clave: string): number {
  return Math.floor(Date.parse(`${clave}T00:00:00Z`) / DIA_MS);
}

export function calcularRacha(
  fechas: Date[],
  ahora = new Date(),
): RachaCalculada {
  const claves = [...new Set(fechas.map(claveDia))].sort();
  if (claves.length === 0) {
    return { actual: 0, mejor: 0, activoHoy: false, ultimaActividad: null };
  }

  let mejor = 1;
  let tramo = 1;
  for (let i = 1; i < claves.length; i += 1) {
    tramo =
      numeroDia(claves[i]) - numeroDia(claves[i - 1]) === 1 ? tramo + 1 : 1;
    mejor = Math.max(mejor, tramo);
  }

  const hoy = numeroDia(claveDia(ahora));
  const ultimo = numeroDia(claves[claves.length - 1]);
  let actual = hoy - ultimo <= 1 ? 1 : 0;
  for (let i = claves.length - 1; actual > 0 && i > 0; i -= 1) {
    if (numeroDia(claves[i]) - numeroDia(claves[i - 1]) !== 1) break;
    actual += 1;
  }

  return {
    actual,
    mejor,
    activoHoy: hoy === ultimo,
    ultimaActividad: claves[claves.length - 1],
  };
}

@Injectable()
export class GamificacionService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerResumen(usuarioId: string) {
    const [respuestas, simulacros, progresos, batallas] = await Promise.all([
      this.prisma.historialRespuesta.findMany({
        where: { usuarioId },
        select: { fechaRespuesta: true, esCorrecta: true, area: true },
      }),
      this.prisma.resultadoSimulacro.findMany({
        where: { usuarioId },
        select: { fechaRealizado: true, puntaje: true },
      }),
      this.prisma.progresoTema.findMany({
        where: { usuarioId },
        select: { fechaVisto: true, completado: true },
      }),
      this.prisma.batallaEstadistica.findUnique({ where: { usuarioId } }),
    ]);

    const fechas = [
      ...respuestas.map((item) => item.fechaRespuesta),
      ...simulacros.map((item) => item.fechaRealizado),
      ...progresos.map((item) => item.fechaVisto),
    ];
    const actividadPorDia = new Map<string, number>();
    for (const fecha of fechas) {
      const dia = claveDia(fecha);
      actividadPorDia.set(dia, (actividadPorDia.get(dia) ?? 0) + 1);
    }
    const racha = calcularRacha(fechas);
    const metricas: MetricaLogro = {
      preguntas: respuestas.length,
      correctas: respuestas.filter((item) => item.esCorrecta).length,
      simulacros: simulacros.length,
      temas: progresos.filter((item) => item.completado).length,
      areas: new Set(respuestas.map((item) => item.area)).size,
      puntajePerfecto: simulacros.some((item) => item.puntaje >= 100) ? 1 : 0,
      racha: racha.mejor,
      batallas: batallas?.batallasJugadas ?? 0,
      victoriasBatalla: batallas?.victorias ?? 0,
      rachaVictorias: batallas?.mejorRachaVictorias ?? 0,
      victoriasPerfectas: batallas?.victoriasPerfectas ?? 0,
    };

    const logros = DEFINICIONES.map((definicion) => {
      const valor = metricas[definicion.metrica];
      return {
        id: definicion.id,
        titulo: definicion.titulo,
        descripcion: definicion.descripcion,
        categoria: definicion.categoria,
        desbloqueado: valor >= definicion.meta,
        progreso: Math.min(valor, definicion.meta),
        meta: definicion.meta,
        porcentaje: Math.min(100, Math.round((valor / definicion.meta) * 100)),
      };
    });

    return {
      racha,
      actividad: [...actividadPorDia.entries()]
        .sort(([diaA], [diaB]) => diaA.localeCompare(diaB))
        .map(([fecha, cantidad]) => ({ fecha, cantidad })),
      resumen: {
        desbloqueados: logros.filter((logro) => logro.desbloqueado).length,
        total: logros.length,
        preguntasRespondidas: metricas.preguntas,
      },
      logros,
    };
  }

  async obtenerLogroDesbloqueado(usuarioId: string, logroId: string) {
    const resumen = await this.obtenerResumen(usuarioId);
    const logro = resumen.logros.find((item) => item.id === logroId);
    if (!logro) throw new NotFoundException('El logro solicitado no existe.');
    if (!logro.desbloqueado) {
      throw new ForbiddenException(
        'Completa este logro antes de descargar su certificado.',
      );
    }
    return logro;
  }
}
