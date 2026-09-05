import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  AreaIcfes,
  EstadoBatalla,
  EstadoParticipanteBatalla,
  ModoBatalla,
  MotivoReporteBatalla,
  OrigenRespuesta,
  Prisma,
  ResultadoParticipanteBatalla,
  RolUsuario,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { preguntaPublicadaWhere } from '../common/contenido-publicado';

const HORAS_PARTIDA = 24;
const MAX_BATALLAS_XP_DIA = 5;
const MAX_REPETICIONES_RIVAL_DIA = 2;
const MIN_PREGUNTAS = 1;
const PREGUNTAS_POR_MODO: Record<ModoBatalla, number> = {
  CARRERA_FANTASMA: 8,
  DUELO_RELAMPAGO: 8,
  SUPERVIVENCIA: 10,
};

interface CrearBatallaEntrada {
  modo: ModoBatalla;
  area?: AreaIcfes;
  invitacionPrivada?: boolean;
}

interface ResponderBatallaEntrada {
  preguntaId: string;
  respuestaId: string;
}

interface ReportarBatallaEntrada {
  motivo: MotivoReporteBatalla;
  detalle?: string;
}

type ClienteTransaccion = Prisma.TransactionClient;
type ParticipanteComparable = {
  vidasRestantes: number | null;
  respuestasCorrectas: number;
  tiempoTotalSegundos: number;
};
type EstadisticaInsignias = {
  victorias: number;
  mejorRachaVictorias: number;
  victoriasPerfectas: number;
};

const INCLUSION_RESUMEN = Prisma.validator<Prisma.BatallaInclude>()({
  participantes: {
    include: { _count: { select: { respuestas: true } } },
  },
  preguntas: { select: { preguntaId: true } },
});
type BatallaConResumen = Prisma.BatallaGetPayload<{
  include: typeof INCLUSION_RESUMEN;
}>;
type ParticipanteResumen = BatallaConResumen['participantes'][number];

function mezclar<T>(elementos: T[]): T[] {
  const copia = [...elementos];
  for (let indice = copia.length - 1; indice > 0; indice -= 1) {
    const destino = Math.floor(Math.random() * (indice + 1));
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  }
  return copia;
}

function codigoInvitacion(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => alfabeto[byte % alfabeto.length]).join('');
}

@Injectable()
export class BatallasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(usuarioId: string) {
    await this.validarEstudiante(usuarioId);
    await this.expirarPendientes();

    const [estadistica, batallas] = await Promise.all([
      this.prisma.batallaEstadistica.findUnique({ where: { usuarioId } }),
      this.prisma.batalla.findMany({
        where: { OR: [{ retadorId: usuarioId }, { rivalId: usuarioId }] },
        orderBy: { fechaCreacion: 'desc' },
        take: 30,
        include: this.inclusionResumen(),
      }),
    ]);

    return {
      resumen: {
        jugadas: estadistica?.batallasJugadas ?? 0,
        victorias: estadistica?.victorias ?? 0,
        derrotas: estadistica?.derrotas ?? 0,
        empates: estadistica?.empates ?? 0,
        rachaActual: estadistica?.rachaVictoriasActual ?? 0,
        mejorRacha: estadistica?.mejorRachaVictorias ?? 0,
        xpBatallas: estadistica?.xpBatallas ?? 0,
      },
      batallas: batallas.map((batalla) =>
        this.presentarResumen(batalla, usuarioId),
      ),
      privacidad: this.privacidad(),
    };
  }

  async crear(usuarioId: string, entrada: CrearBatallaEntrada) {
    await this.validarEstudiante(usuarioId);
    await this.expirarPendientes();

    if (!entrada.invitacionPrivada) {
      const emparejada = await this.intentarEmparejar(usuarioId, entrada);
      if (emparejada) return this.obtenerDetalle(usuarioId, emparejada);
    }

    const preguntas = await this.seleccionarPreguntas(
      entrada.modo,
      entrada.area,
    );
    const ahora = new Date();
    const expiraEn = new Date(ahora.getTime() + HORAS_PARTIDA * 60 * 60 * 1000);
    const estado = entrada.invitacionPrivada
      ? EstadoBatalla.PENDIENTE
      : EstadoBatalla.BUSCANDO;

    const batalla = await this.prisma.batalla.create({
      data: {
        modo: entrada.modo,
        area: entrada.area,
        estado,
        retadorId: usuarioId,
        codigoInvitacion: entrada.invitacionPrivada ? codigoInvitacion() : null,
        expiraEn,
        preguntas: {
          create: preguntas.map((pregunta, orden) => ({
            preguntaId: pregunta.id,
            orden,
            opcionesOrden: mezclar(pregunta.respuestas.map((item) => item.id)),
          })),
        },
        participantes: {
          create: [
            {
              usuarioId,
              estado: EstadoParticipanteBatalla.LISTO,
              vidasRestantes:
                entrada.modo === ModoBatalla.SUPERVIVENCIA ? 3 : null,
            },
          ],
        },
      },
      select: { id: true },
    });

    return this.obtenerDetalle(usuarioId, batalla.id);
  }

  async unirseInvitacion(usuarioId: string, codigo: string) {
    await this.validarEstudiante(usuarioId);
    await this.expirarPendientes();
    const batalla = await this.prisma.batalla.findFirst({
      where: {
        codigoInvitacion: codigo.trim().toUpperCase(),
        estado: EstadoBatalla.PENDIENTE,
        rivalId: null,
        retadorId: { not: usuarioId },
        expiraEn: { gt: new Date() },
      },
      select: { id: true, retadorId: true, modo: true },
    });
    if (!batalla) {
      throw new NotFoundException(
        'La invitacion no existe, vencio o ya fue utilizada.',
      );
    }
    await this.validarSinBloqueo(usuarioId, batalla.retadorId);

    const unida = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.batalla.updateMany({
        where: {
          id: batalla.id,
          estado: EstadoBatalla.PENDIENTE,
          rivalId: null,
        },
        data: {
          rivalId: usuarioId,
          codigoInvitacion: null,
          estado: EstadoBatalla.ACTIVA,
          fechaActivacion: new Date(),
        },
      });
      if (actualizada.count !== 1) return false;
      await tx.batallaParticipante.create({
        data: {
          batallaId: batalla.id,
          usuarioId,
          estado: EstadoParticipanteBatalla.LISTO,
          vidasRestantes: batalla.modo === ModoBatalla.SUPERVIVENCIA ? 3 : null,
        },
      });
      return true;
    });
    if (!unida) {
      throw new BadRequestException('La invitacion acaba de ser utilizada.');
    }
    return this.obtenerDetalle(usuarioId, batalla.id);
  }

  async aceptar(usuarioId: string, batallaId: string) {
    await this.validarEstudiante(usuarioId);
    const batalla = await this.obtenerBatallaParticipante(batallaId, usuarioId);
    this.validarVigencia(batalla);
    if (
      batalla.rivalId !== usuarioId ||
      batalla.estado !== EstadoBatalla.PENDIENTE
    ) {
      throw new BadRequestException('Esta invitacion no puede aceptarse.');
    }
    await this.validarSinBloqueo(usuarioId, batalla.retadorId);

    await this.prisma.$transaction([
      this.prisma.batallaParticipante.update({
        where: { batallaId_usuarioId: { batallaId, usuarioId } },
        data: { estado: EstadoParticipanteBatalla.LISTO },
      }),
      this.prisma.batalla.update({
        where: { id: batallaId },
        data: { estado: EstadoBatalla.ACTIVA, fechaActivacion: new Date() },
      }),
    ]);
    return this.obtenerDetalle(usuarioId, batallaId);
  }

  async cancelar(usuarioId: string, batallaId: string) {
    await this.validarEstudiante(usuarioId);
    const cancelada = await this.prisma.batalla.updateMany({
      where: {
        id: batallaId,
        retadorId: usuarioId,
        estado: { in: [EstadoBatalla.BUSCANDO, EstadoBatalla.PENDIENTE] },
      },
      data: {
        estado: EstadoBatalla.CANCELADA,
        codigoInvitacion: null,
        fechaFinalizacion: new Date(),
      },
    });
    if (cancelada.count !== 1) {
      throw new BadRequestException(
        'Solo puedes cancelar una busqueda o invitacion propia.',
      );
    }
    return this.obtenerDetalle(usuarioId, batallaId);
  }

  async iniciar(usuarioId: string, batallaId: string) {
    await this.validarEstudiante(usuarioId);
    const batalla = await this.obtenerBatallaParticipante(batallaId, usuarioId);
    this.validarVigencia(batalla);
    if (batalla.estado !== EstadoBatalla.ACTIVA) {
      throw new BadRequestException('La batalla aun no esta activa.');
    }

    const participante = batalla.participantes[0];
    if (participante.estado === EstadoParticipanteBatalla.FINALIZADO) {
      return this.obtenerDetalle(usuarioId, batallaId);
    }
    if (participante.estado !== EstadoParticipanteBatalla.EN_JUEGO) {
      await this.prisma.batallaParticipante.update({
        where: { batallaId_usuarioId: { batallaId, usuarioId } },
        data: {
          estado: EstadoParticipanteBatalla.EN_JUEGO,
          iniciadoEn: new Date(),
        },
      });
    }
    return this.obtenerDetalle(usuarioId, batallaId);
  }

  async responder(
    usuarioId: string,
    batallaId: string,
    entrada: ResponderBatallaEntrada,
  ) {
    await this.validarEstudiante(usuarioId);
    let termino = false;

    await this.prisma.$transaction(async (tx) => {
      const batalla = await tx.batalla.findFirst({
        where: {
          id: batallaId,
          estado: EstadoBatalla.ACTIVA,
          participantes: { some: { usuarioId } },
        },
        include: {
          preguntas: { orderBy: { orden: 'asc' } },
          participantes: { where: { usuarioId } },
        },
      });
      if (!batalla) {
        throw new NotFoundException('Batalla activa no encontrada.');
      }
      this.validarVigencia(batalla);
      const participante = batalla.participantes[0];
      if (participante.estado !== EstadoParticipanteBatalla.EN_JUEGO) {
        throw new BadRequestException('Inicia la batalla antes de responder.');
      }

      const respondidas = await tx.batallaRespuesta.findMany({
        where: { batallaId, usuarioId },
        orderBy: { orden: 'desc' },
        take: 1,
        select: { orden: true, respondidaEn: true },
      });
      const siguienteOrden = (respondidas[0]?.orden ?? -1) + 1;
      const preguntaBatalla = batalla.preguntas[siguienteOrden];
      if (
        !preguntaBatalla ||
        preguntaBatalla.preguntaId !== entrada.preguntaId
      ) {
        throw new BadRequestException(
          'Responde las preguntas en el orden de la batalla.',
        );
      }

      const pregunta = await tx.pregunta.findUnique({
        where: { id: entrada.preguntaId },
        include: {
          respuestas: true,
          subtema: { select: { tema: { select: { area: true } } } },
        },
      });
      if (!pregunta) throw new NotFoundException('Pregunta no encontrada.');
      const seleccionada = pregunta.respuestas.find(
        (respuesta) => respuesta.id === entrada.respuestaId,
      );
      const correcta = pregunta.respuestas.find(
        (respuesta) => respuesta.esCorrecta,
      );
      if (!seleccionada || !correcta) {
        throw new BadRequestException(
          'La respuesta no pertenece a esta pregunta.',
        );
      }

      const ahora = new Date();
      const inicioTramo =
        respondidas[0]?.respondidaEn ?? participante.iniciadoEn;
      const tiempo = Math.max(
        1,
        Math.min(
          3600,
          Math.round((ahora.getTime() - inicioTramo.getTime()) / 1000),
        ),
      );
      const esCorrecta = seleccionada.id === correcta.id;
      const vidas =
        batalla.modo === ModoBatalla.SUPERVIVENCIA
          ? Math.max(
              0,
              (participante.vidasRestantes ?? 3) - (esCorrecta ? 0 : 1),
            )
          : participante.vidasRestantes;
      termino =
        siguienteOrden + 1 >= batalla.preguntas.length ||
        (batalla.modo === ModoBatalla.SUPERVIVENCIA && vidas === 0);

      await tx.batallaRespuesta.create({
        data: {
          batallaId,
          usuarioId,
          preguntaId: pregunta.id,
          respuestaSeleccionadaId: seleccionada.id,
          orden: siguienteOrden,
          esCorrecta,
          tiempoRespuestaSegundos: tiempo,
        },
      });
      await tx.historialRespuesta.create({
        data: {
          sesionId: batallaId,
          usuarioId,
          preguntaId: pregunta.id,
          respuestaSeleccionadaId: seleccionada.id,
          respuestaCorrectaId: correcta.id,
          area: pregunta.subtema.tema.area,
          origen: OrigenRespuesta.BATALLA,
          esCorrecta,
          tiempoRespuestaSegundos: tiempo,
        },
      });
      await tx.batallaParticipante.update({
        where: { batallaId_usuarioId: { batallaId, usuarioId } },
        data: {
          respuestasCorrectas: { increment: esCorrecta ? 1 : 0 },
          tiempoTotalSegundos: { increment: tiempo },
          vidasRestantes: vidas,
          ...(termino
            ? {
                estado: EstadoParticipanteBatalla.FINALIZADO,
                finalizadoEn: ahora,
              }
            : {}),
        },
      });
    });

    if (termino) await this.liquidarSiCompleta(batallaId);
    return this.obtenerDetalle(usuarioId, batallaId);
  }

  async finalizar(usuarioId: string, batallaId: string) {
    await this.validarEstudiante(usuarioId);
    const batalla = await this.obtenerBatallaParticipante(batallaId, usuarioId);
    this.validarVigencia(batalla);
    const participante = batalla.participantes[0];
    const total = batalla.preguntas.length;
    const respondidas = participante._count.respuestas;
    const sinVidas =
      batalla.modo === ModoBatalla.SUPERVIVENCIA &&
      participante.vidasRestantes === 0;
    if (respondidas < total && !sinVidas) {
      throw new BadRequestException(
        'Completa todas las preguntas antes de finalizar.',
      );
    }
    if (participante.estado !== EstadoParticipanteBatalla.FINALIZADO) {
      await this.prisma.batallaParticipante.update({
        where: { batallaId_usuarioId: { batallaId, usuarioId } },
        data: {
          estado: EstadoParticipanteBatalla.FINALIZADO,
          finalizadoEn: new Date(),
        },
      });
    }
    await this.liquidarSiCompleta(batallaId);
    return this.obtenerDetalle(usuarioId, batallaId);
  }

  async listarBloqueos(usuarioId: string) {
    await this.validarEstudiante(usuarioId);
    const bloqueos = await this.prisma.batallaBloqueo.findMany({
      where: { bloqueadorId: usuarioId },
      orderBy: { fechaCreacion: 'desc' },
      select: { id: true, fechaCreacion: true },
    });
    return {
      bloqueos: bloqueos.map((bloqueo, indice) => ({
        id: bloqueo.id,
        alias: `Rival bloqueado ${bloqueos.length - indice}`,
        creadoEn: bloqueo.fechaCreacion.toISOString(),
      })),
      privacidad: this.privacidad(),
    };
  }

  async bloquearRival(usuarioId: string, batallaId: string) {
    await this.validarEstudiante(usuarioId);
    const rivalId = await this.obtenerRivalId(batallaId, usuarioId);
    const bloqueo = await this.prisma.batallaBloqueo.upsert({
      where: {
        bloqueadorId_bloqueadoId: {
          bloqueadorId: usuarioId,
          bloqueadoId: rivalId,
        },
      },
      create: { bloqueadorId: usuarioId, bloqueadoId: rivalId },
      update: {},
      select: { id: true, fechaCreacion: true },
    });
    return {
      id: bloqueo.id,
      alias: 'Rival bloqueado',
      creadoEn: bloqueo.fechaCreacion.toISOString(),
      privacidad: this.privacidad(),
    };
  }

  async desbloquear(usuarioId: string, bloqueoId: string) {
    await this.validarEstudiante(usuarioId);
    const eliminado = await this.prisma.batallaBloqueo.deleteMany({
      where: { id: bloqueoId, bloqueadorId: usuarioId },
    });
    if (eliminado.count !== 1) {
      throw new NotFoundException('Bloqueo no encontrado.');
    }
    return { eliminado: true };
  }

  async reportar(
    usuarioId: string,
    batallaId: string,
    entrada: ReportarBatallaEntrada,
  ) {
    await this.validarEstudiante(usuarioId);
    const reportadoId = await this.obtenerRivalId(batallaId, usuarioId);
    const existente = await this.prisma.batallaReporte.findUnique({
      where: { batallaId_reportanteId: { batallaId, reportanteId: usuarioId } },
      select: { id: true, estado: true, fechaCreacion: true },
    });
    const reporte =
      existente ??
      (await this.prisma.batallaReporte.create({
        data: {
          batallaId,
          reportanteId: usuarioId,
          reportadoId,
          motivo: entrada.motivo,
          detalle: entrada.detalle?.trim() || null,
        },
        select: { id: true, estado: true, fechaCreacion: true },
      }));
    return {
      id: reporte.id,
      estado: reporte.estado,
      recibidoEn: reporte.fechaCreacion.toISOString(),
    };
  }

  async obtenerDetalle(usuarioId: string, batallaId: string) {
    await this.validarEstudiante(usuarioId);
    const batalla = await this.prisma.batalla.findFirst({
      where: {
        id: batallaId,
        OR: [{ retadorId: usuarioId }, { rivalId: usuarioId }],
      },
      include: {
        participantes: {
          include: {
            _count: { select: { respuestas: true } },
          },
        },
        preguntas: {
          orderBy: { orden: 'asc' },
          include: {
            pregunta: {
              include: {
                respuestas: true,
                caso: { select: { contexto: true, imagenUrl: true } },
              },
            },
          },
        },
        respuestas: { where: { usuarioId } },
      },
    });
    if (!batalla) throw new NotFoundException('Batalla no encontrada.');

    const resumen = this.presentarResumen(batalla, usuarioId);
    const propias = new Map(
      batalla.respuestas.map((respuesta) => [respuesta.preguntaId, respuesta]),
    );
    const finalizada = batalla.estado === EstadoBatalla.FINALIZADA;
    const yo = batalla.participantes.find(
      (item) => item.usuarioId === usuarioId,
    );
    const estadistica = await this.prisma.batallaEstadistica.findUnique({
      where: { usuarioId },
    });

    return {
      ...resumen,
      totalPreguntas: batalla.preguntas.length,
      iniciadaEn: yo?.iniciadoEn?.toISOString() ?? null,
      finalizadaEn: batalla.fechaFinalizacion?.toISOString() ?? null,
      yo: { alias: 'Tu' },
      preguntas: (yo?.iniciadoEn || finalizada ? batalla.preguntas : []).map(
        (item) => {
          const ordenOpciones = Array.isArray(item.opcionesOrden)
            ? (item.opcionesOrden as string[])
            : [];
          const opciones = new Map(
            item.pregunta.respuestas.map((respuesta) => [
              respuesta.id,
              respuesta,
            ]),
          );
          const propia = propias.get(item.preguntaId);
          const correcta = item.pregunta.respuestas.find(
            (respuesta) => respuesta.esCorrecta,
          );
          return {
            id: item.pregunta.id,
            enunciado: item.pregunta.enunciado,
            contexto: item.pregunta.caso?.contexto ?? null,
            imagenUrl:
              item.pregunta.imagenUrl ?? item.pregunta.caso?.imagenUrl ?? null,
            opciones: ordenOpciones
              .map((id) => opciones.get(id))
              .filter(Boolean)
              .map((respuesta) => ({
                id: respuesta.id,
                texto: respuesta.texto,
              })),
            respuestaPropiaId: propia?.respuestaSeleccionadaId ?? null,
            ...(finalizada
              ? {
                  esCorrecta: propia?.esCorrecta ?? null,
                  respuestaCorrectaId: correcta?.id ?? null,
                  explicacion:
                    item.pregunta.explicacion ?? correcta?.explicacion ?? null,
                }
              : {}),
          };
        },
      ),
      insigniasDesbloqueadas: this.insignias(estadistica),
      privacidad: this.privacidad(),
    };
  }

  private async intentarEmparejar(
    usuarioId: string,
    entrada: CrearBatallaEntrada,
  ): Promise<string | null> {
    const candidatas = await this.prisma.batalla.findMany({
      where: {
        estado: EstadoBatalla.BUSCANDO,
        modo: entrada.modo,
        area: entrada.area ?? null,
        retadorId: { not: usuarioId },
        rivalId: null,
        expiraEn: { gt: new Date() },
      },
      orderBy: { fechaCreacion: 'asc' },
      take: 20,
      select: { id: true, modo: true, retadorId: true },
    });
    if (candidatas.length === 0) return null;
    const ids = candidatas.map((item) => item.retadorId);
    const bloqueos = await this.prisma.batallaBloqueo.findMany({
      where: {
        OR: [
          { bloqueadorId: usuarioId, bloqueadoId: { in: ids } },
          { bloqueadoId: usuarioId, bloqueadorId: { in: ids } },
        ],
      },
      select: { bloqueadorId: true, bloqueadoId: true },
    });
    const noDisponibles = new Set(
      bloqueos.map((item) =>
        item.bloqueadorId === usuarioId ? item.bloqueadoId : item.bloqueadorId,
      ),
    );
    const candidata = candidatas.find(
      (item) => !noDisponibles.has(item.retadorId),
    );
    if (!candidata) return null;

    const resultado = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.batalla.updateMany({
        where: {
          id: candidata.id,
          estado: EstadoBatalla.BUSCANDO,
          rivalId: null,
        },
        data: {
          rivalId: usuarioId,
          estado: EstadoBatalla.ACTIVA,
          fechaActivacion: new Date(),
        },
      });
      if (actualizada.count !== 1) return false;
      await tx.batallaParticipante.create({
        data: {
          batallaId: candidata.id,
          usuarioId,
          estado: EstadoParticipanteBatalla.LISTO,
          vidasRestantes:
            candidata.modo === ModoBatalla.SUPERVIVENCIA ? 3 : null,
        },
      });
      return true;
    });
    return resultado ? candidata.id : null;
  }

  private async seleccionarPreguntas(modo: ModoBatalla, area?: AreaIcfes) {
    const candidatas = await this.prisma.pregunta.findMany({
      where: preguntaPublicadaWhere({
        ...(area ? { subtema: { tema: { area } } } : {}),
        respuestas: { some: { esCorrecta: true } },
      }),
      include: { respuestas: { select: { id: true, esCorrecta: true } } },
      take: 150,
    });
    const validas = candidatas.filter(
      (pregunta) =>
        pregunta.respuestas.length >= 2 &&
        pregunta.respuestas.filter((respuesta) => respuesta.esCorrecta)
          .length === 1,
    );
    const cantidad = Math.min(PREGUNTAS_POR_MODO[modo], validas.length);
    if (cantidad < MIN_PREGUNTAS) {
      throw new BadRequestException(
        'No hay suficientes preguntas publicadas para crear esta batalla.',
      );
    }
    return mezclar(validas).slice(0, cantidad);
  }

  private async liquidarSiCompleta(batallaId: string) {
    await this.prisma.$transaction(async (tx) => {
      const batalla = await tx.batalla.findUnique({
        where: { id: batallaId },
        include: {
          participantes: true,
          preguntas: { select: { preguntaId: true } },
        },
      });
      if (
        !batalla ||
        batalla.xpLiquidadoEn ||
        batalla.participantes.length !== 2 ||
        batalla.participantes.some(
          (item) => item.estado !== EstadoParticipanteBatalla.FINALIZADO,
        )
      ) {
        return;
      }

      const [primero, segundo] = batalla.participantes;
      const comparacion = this.compararParticipantes(
        batalla.modo,
        primero,
        segundo,
      );
      const ganadorId =
        comparacion === 0
          ? null
          : comparacion > 0
            ? primero.usuarioId
            : segundo.usuarioId;
      const tomada = await tx.batalla.updateMany({
        where: {
          id: batallaId,
          xpLiquidadoEn: null,
          estado: EstadoBatalla.ACTIVA,
        },
        data: {
          estado: EstadoBatalla.FINALIZADA,
          ganadorId,
          xpLiquidadoEn: new Date(),
          fechaFinalizacion: new Date(),
        },
      });
      if (tomada.count !== 1) return;

      for (const participante of batalla.participantes) {
        const esGanador = ganadorId === participante.usuarioId;
        const esEmpate = ganadorId === null;
        const resultado = esEmpate
          ? ResultadoParticipanteBatalla.EMPATE
          : esGanador
            ? ResultadoParticipanteBatalla.GANADA
            : ResultadoParticipanteBatalla.PERDIDA;
        const rivalId = batalla.participantes.find(
          (item) => item.usuarioId !== participante.usuarioId,
        )?.usuarioId;
        const elegible = await this.esXpElegible(
          tx,
          participante.usuarioId,
          rivalId,
          batallaId,
        );
        const perfecta =
          participante.respuestasCorrectas === batalla.preguntas.length;
        const xpBase = esEmpate ? 25 : esGanador ? 40 : 15;
        const xpGanado = elegible ? xpBase + (perfecta ? 10 : 0) : 0;

        await tx.batallaParticipante.update({
          where: {
            batallaId_usuarioId: {
              batallaId,
              usuarioId: participante.usuarioId,
            },
          },
          data: { resultado, xpElegible: elegible, xpGanado },
        });
        if (xpGanado > 0) {
          await tx.usuario.update({
            where: { id: participante.usuarioId },
            data: { xpTotal: { increment: xpGanado } },
          });
        }
        await this.actualizarEstadistica(
          tx,
          participante.usuarioId,
          resultado,
          perfecta,
          xpGanado,
        );
      }
    });
  }

  private async esXpElegible(
    tx: ClienteTransaccion,
    usuarioId: string,
    rivalId: string | undefined,
    batallaId: string,
  ) {
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [premiadas, repetidas] = await Promise.all([
      tx.batallaParticipante.count({
        where: {
          usuarioId,
          batallaId: { not: batallaId },
          xpGanado: { gt: 0 },
          finalizadoEn: { gte: desde },
        },
      }),
      rivalId
        ? tx.batalla.count({
            where: {
              id: { not: batallaId },
              estado: EstadoBatalla.FINALIZADA,
              fechaFinalizacion: { gte: desde },
              OR: [
                { retadorId: usuarioId, rivalId },
                { retadorId: rivalId, rivalId: usuarioId },
              ],
            },
          })
        : Promise.resolve(0),
    ]);
    return (
      premiadas < MAX_BATALLAS_XP_DIA && repetidas < MAX_REPETICIONES_RIVAL_DIA
    );
  }

  private async actualizarEstadistica(
    tx: ClienteTransaccion,
    usuarioId: string,
    resultado: ResultadoParticipanteBatalla,
    perfecta: boolean,
    xpGanado: number,
  ) {
    await tx.batallaEstadistica.upsert({
      where: { usuarioId },
      create: { usuarioId },
      update: {},
    });
    const actualizada = await tx.batallaEstadistica.update({
      where: { usuarioId },
      data: {
        batallasJugadas: { increment: 1 },
        victorias: {
          increment: resultado === ResultadoParticipanteBatalla.GANADA ? 1 : 0,
        },
        derrotas: {
          increment: resultado === ResultadoParticipanteBatalla.PERDIDA ? 1 : 0,
        },
        empates: {
          increment: resultado === ResultadoParticipanteBatalla.EMPATE ? 1 : 0,
        },
        rachaVictoriasActual:
          resultado === ResultadoParticipanteBatalla.GANADA
            ? { increment: 1 }
            : 0,
        victoriasPerfectas: {
          increment:
            perfecta && resultado === ResultadoParticipanteBatalla.GANADA
              ? 1
              : 0,
        },
        xpBatallas: { increment: xpGanado },
      },
    });
    if (actualizada.rachaVictoriasActual > actualizada.mejorRachaVictorias) {
      await tx.batallaEstadistica.update({
        where: { usuarioId },
        data: {
          mejorRachaVictorias: actualizada.rachaVictoriasActual,
        },
      });
    }
  }

  private compararParticipantes(
    modo: ModoBatalla,
    primero: ParticipanteComparable,
    segundo: ParticipanteComparable,
  ) {
    const comparar = (a: number, b: number) => (a === b ? 0 : a > b ? 1 : -1);
    if (modo === ModoBatalla.SUPERVIVENCIA) {
      const porVidas = comparar(
        primero.vidasRestantes ?? 0,
        segundo.vidasRestantes ?? 0,
      );
      if (porVidas !== 0) return porVidas;
    }
    const porCorrectas = comparar(
      primero.respuestasCorrectas,
      segundo.respuestasCorrectas,
    );
    if (porCorrectas !== 0) return porCorrectas;
    return comparar(segundo.tiempoTotalSegundos, primero.tiempoTotalSegundos);
  }

  private inclusionResumen() {
    return INCLUSION_RESUMEN;
  }

  private presentarResumen(batalla: BatallaConResumen, usuarioId: string) {
    const propio = batalla.participantes.find(
      (item) => item.usuarioId === usuarioId,
    );
    const rivalParticipante = batalla.participantes.find(
      (item) => item.usuarioId !== usuarioId,
    );
    return {
      id: batalla.id,
      modo: batalla.modo,
      area: batalla.area,
      estado: batalla.estado,
      creadaEn: batalla.fechaCreacion.toISOString(),
      expiraEn: batalla.expiraEn.toISOString(),
      rival: rivalParticipante ? { alias: 'Rival anonimo' } : null,
      soyCreador: batalla.retadorId === usuarioId,
      codigoInvitacion:
        batalla.retadorId === usuarioId &&
        batalla.estado === EstadoBatalla.PENDIENTE
          ? batalla.codigoInvitacion
          : null,
      progresoPropio: this.presentarProgreso(
        propio,
        batalla.preguntas.length,
        batalla.estado !== EstadoBatalla.FINALIZADA,
      ),
      progresoRival: rivalParticipante
        ? this.presentarProgreso(
            rivalParticipante,
            batalla.preguntas.length,
            batalla.estado !== EstadoBatalla.FINALIZADA,
          )
        : null,
      resultado: this.presentarResultado(propio?.resultado),
      xpGanado: propio?.xpGanado ?? 0,
      privacidad: this.privacidad(),
    };
  }

  private presentarProgreso(
    participante: ParticipanteResumen | undefined,
    totalPreguntas: number,
    ocultarAciertos = false,
  ) {
    if (!participante) {
      return {
        respondidas: 0,
        correctas: 0,
        totalPreguntas,
        energia: 0,
        vidas: 3,
        finalizo: false,
      };
    }
    const respondidas = participante._count?.respuestas ?? 0;
    return {
      respondidas,
      correctas: ocultarAciertos ? null : participante.respuestasCorrectas,
      totalPreguntas,
      energia:
        !ocultarAciertos && totalPreguntas
          ? Math.round(
              (participante.respuestasCorrectas / totalPreguntas) * 100,
            )
          : null,
      vidas: participante.vidasRestantes ?? 3,
      finalizo: participante.estado === EstadoParticipanteBatalla.FINALIZADO,
    };
  }

  private privacidad() {
    return {
      identidadesProtegidas: true,
      chatHabilitado: false,
      datosRivalPublicados: ['alias', 'progreso'],
    };
  }

  private presentarResultado(resultado?: ResultadoParticipanteBatalla) {
    if (resultado === ResultadoParticipanteBatalla.GANADA) return 'VICTORIA';
    if (resultado === ResultadoParticipanteBatalla.PERDIDA) return 'DERROTA';
    if (resultado === ResultadoParticipanteBatalla.EMPATE) return 'EMPATE';
    return null;
  }

  private insignias(estadistica: EstadisticaInsignias | null) {
    if (!estadistica) return [];
    return [
      {
        id: 'PRIMERA_VICTORIA',
        titulo: 'Primera victoria',
        descripcion: 'Gana tu primera batalla.',
        desbloqueada: estadistica.victorias >= 1,
      },
      {
        id: 'RACHA_BATALLA_3',
        titulo: 'Imparable',
        descripcion: 'Consigue una racha de 3 victorias.',
        desbloqueada: estadistica.mejorRachaVictorias >= 3,
      },
      {
        id: 'VETERANO_BATALLA',
        titulo: 'Veterano de batalla',
        descripcion: 'Gana 10 batallas.',
        desbloqueada: estadistica.victorias >= 10,
      },
      {
        id: 'VICTORIA_PERFECTA',
        titulo: 'Victoria perfecta',
        descripcion: 'Gana una batalla sin fallar.',
        desbloqueada: estadistica.victoriasPerfectas >= 1,
      },
    ]
      .filter((item) => item.desbloqueada)
      .map((item) => ({
        id: item.id,
        titulo: item.titulo,
        descripcion: item.descripcion,
      }));
  }

  private async obtenerRivalId(batallaId: string, usuarioId: string) {
    const batalla = await this.prisma.batalla.findFirst({
      where: {
        id: batallaId,
        OR: [{ retadorId: usuarioId }, { rivalId: usuarioId }],
      },
      select: { retadorId: true, rivalId: true },
    });
    if (!batalla) throw new NotFoundException('Batalla no encontrada.');
    const rivalId =
      batalla.retadorId === usuarioId ? batalla.rivalId : batalla.retadorId;
    if (!rivalId) {
      throw new BadRequestException('Esta batalla todavia no tiene rival.');
    }
    return rivalId;
  }

  private async validarSinBloqueo(usuarioId: string, rivalId: string) {
    const bloqueo = await this.prisma.batallaBloqueo.findFirst({
      where: {
        OR: [
          { bloqueadorId: usuarioId, bloqueadoId: rivalId },
          { bloqueadorId: rivalId, bloqueadoId: usuarioId },
        ],
      },
      select: { id: true },
    });
    if (bloqueo) {
      throw new ForbiddenException(
        'No es posible crear una batalla entre estas cuentas.',
      );
    }
  }

  private async validarEstudiante(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, rol: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (usuario.rol !== RolUsuario.ESTUDIANTE) {
      throw new ForbiddenException(
        'Las batallas estan disponibles para estudiantes.',
      );
    }
    return usuario;
  }

  private async obtenerBatallaParticipante(
    batallaId: string,
    usuarioId: string,
  ) {
    const batalla = await this.prisma.batalla.findFirst({
      where: { id: batallaId, participantes: { some: { usuarioId } } },
      include: {
        participantes: {
          where: { usuarioId },
          include: { _count: { select: { respuestas: true } } },
        },
        preguntas: { select: { preguntaId: true } },
      },
    });
    if (!batalla) throw new NotFoundException('Batalla no encontrada.');
    return batalla;
  }

  private validarVigencia(batalla: { expiraEn: Date; estado: EstadoBatalla }) {
    if (batalla.expiraEn <= new Date()) {
      throw new BadRequestException('Esta batalla ya expiro.');
    }
    if (
      batalla.estado === EstadoBatalla.EXPIRADA ||
      batalla.estado === EstadoBatalla.CANCELADA
    ) {
      throw new BadRequestException('Esta batalla ya no esta disponible.');
    }
  }

  private async expirarPendientes() {
    await this.prisma.batalla.updateMany({
      where: {
        estado: {
          in: [
            EstadoBatalla.BUSCANDO,
            EstadoBatalla.PENDIENTE,
            EstadoBatalla.ACTIVA,
          ],
        },
        expiraEn: { lte: new Date() },
      },
      data: { estado: EstadoBatalla.EXPIRADA },
    });
  }
}
