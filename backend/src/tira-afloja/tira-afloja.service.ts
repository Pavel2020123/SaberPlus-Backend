import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AreaIcfes,
  EstadoPartidaTiraAfloja,
  Prisma,
  ResultadoPartidaTiraAfloja,
  RolUsuario,
  TipoEventoTiraAfloja,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { preguntaPublicadaWhere } from '../common/contenido-publicado';
import { TiraAflojaRealtimePublisher } from './tira-afloja-realtime.publisher';
import { requireTugPresence } from './tira-afloja-presence.service';
import { TiraAflojaVisibilityWitness } from './tira-afloja-visibility.witness';
import {
  tugAdmissionDecision,
  tugAdmissionQueue,
} from './tira-afloja.admission';
import {
  buildTugSnapshot,
  TUG_QUESTION_INCLUDE,
  tugSnapshot,
} from './tira-afloja.evidence';
import {
  ganadorPorPosicion,
  moverCuerda,
  resolverRonda,
  resolverRondaExacta,
  resultadoPorPreguntasAgotadas,
} from './tira-afloja.rules';

const PREGUNTAS_POR_PARTIDA = 20;
const MINIMO_PREGUNTAS = 4;
const SEGUNDOS_POR_RONDA = 10;
const PAUSA_ENTRE_RONDAS_MS = 1500;
const CUENTA_REGRESIVA_INICIAL_MS = 3000;
const MINUTOS_BUSQUEDA = 2;
const MINUTOS_PARTIDA = 30;

const ESTADOS_ABIERTOS: EstadoPartidaTiraAfloja[] = [
  EstadoPartidaTiraAfloja.BUSCANDO,
  EstadoPartidaTiraAfloja.PREPARANDO,
  EstadoPartidaTiraAfloja.ACTIVA,
];

interface ResponderEntrada {
  ronda: number;
  preguntaId: string;
  respuestaId: string;
  idempotencyKey: string;
}

type ClienteTransaccion = Prisma.TransactionClient;

function sumarMinutos(fecha: Date, minutos: number): Date {
  return new Date(fecha.getTime() + minutos * 60_000);
}

function mezclar<T>(elementos: T[]): T[] {
  const copia = [...elementos];
  for (let indice = copia.length - 1; indice > 0; indice -= 1) {
    const destino = Math.floor(Math.random() * (indice + 1));
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  }
  return copia;
}

@Injectable()
export class TiraAflojaService implements OnModuleInit, OnModuleDestroy {
  private barridoEnCurso = false;
  private temporizador?: NodeJS.Timeout;
  private readonly log = new Logger(TiraAflojaService.name);
  private readonly visibilityWitness: TiraAflojaVisibilityWitness;

  constructor(
    private readonly prisma: PrismaService,
    private readonly actualizaciones: TiraAflojaRealtimePublisher,
  ) {
    this.visibilityWitness = new TiraAflojaVisibilityWitness(prisma);
  }

  onModuleInit(): void {
    this.temporizador = setInterval(() => {
      void this.procesarPartidasVencidas();
    }, 1000);
    this.temporizador.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    await this.visibilityWitness.close();
  }

  async emparejar(usuarioId: string, area?: AreaIcfes) {
    await this.validarEstudiante(usuarioId);
    const activa = await this.buscarActiva(usuarioId);
    if (activa) return this.obtener(usuarioId, activa.id);

    const preguntas = await this.seleccionarPreguntas(area);
    const ahora = new Date();

    const partidaId = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, `emparejamiento:${usuarioId}`);

      const repetida = await this.buscarActiva(usuarioId, tx);
      if (repetida) return repetida.id;

      // Decide once under the matchmaking transaction; reused matches retain
      // their original admission regardless of the current environment.
      const admission = tugAdmissionDecision();

      const candidata = await tx.partidaTiraAfloja.findFirst({
        where: {
          ...tugAdmissionQueue(admission.competitiveRulesVersion === 1),
          estado: EstadoPartidaTiraAfloja.BUSCANDO,
          jugadorAId: { not: usuarioId },
          jugadorBId: null,
          expiraEn: { gt: ahora },
          area: area ?? null,
        },
        orderBy: { fechaCreacion: 'asc' },
      });

      if (candidata) {
        await this.bloquear(tx, `partida:${candidata.id}`);
        const actualizada = await tx.partidaTiraAfloja.updateMany({
          where: {
            id: candidata.id,
            estado: EstadoPartidaTiraAfloja.BUSCANDO,
            jugadorBId: null,
          },
          data: {
            jugadorBId: usuarioId,
            estado: EstadoPartidaTiraAfloja.PREPARANDO,
            fechaEmparejamiento: ahora,
            expiraEn: sumarMinutos(ahora, MINUTOS_PARTIDA),
            version: { increment: 1 },
          },
        });
        if (actualizada.count === 1) {
          await this.crearEvento(
            tx,
            candidata.id,
            candidata.version + 1,
            TipoEventoTiraAfloja.EMPAREJADA,
            { jugadorBId: usuarioId },
          );
          return candidata.id;
        }
      }

      // Legacy candidates keep their existing contract. Validate the bank for
      // evidence preparation only when creating a genuinely new match.
      const preparadas = preguntas.filter(
        (p) => p.respuestas.filter((r) => r.esCorrecta).length === 1,
      );
      if (preparadas.length < MINIMO_PREGUNTAS) {
        throw new BadRequestException(
          'Banco insuficiente para preparar evidencia Tira.',
        );
      }
      const creada = await tx.partidaTiraAfloja.create({
        data: {
          ...admission,
          temporalVersion: admission.competitiveRulesVersion === 1 ? 1 : null,
          prepararEvidencia: true,
          presenciaVersion: 1,
          certificacionRVersion: 1,
          jugadorAId: usuarioId,
          area,
          expiraEn: sumarMinutos(ahora, MINUTOS_BUSQUEDA),
          preguntas: {
            create: preparadas.map((pregunta, indice) => ({
              preguntaId: pregunta.id,
              orden: indice + 1,
              opcionesOrden: mezclar(
                pregunta.respuestas.map((respuesta) => respuesta.id),
              ),
            })),
          },
          eventos: {
            create: {
              version: 0,
              tipo: TipoEventoTiraAfloja.BUSQUEDA_INICIADA,
              datos: { area: area ?? null },
            },
          },
        },
      });
      return creada.id;
    });

    this.actualizaciones.notificar(partidaId);
    return this.obtener(usuarioId, partidaId);
  }

  async obtenerActiva(usuarioId: string) {
    await this.validarEstudiante(usuarioId);
    const partida = await this.buscarActiva(usuarioId);
    return partida ? this.obtener(usuarioId, partida.id) : null;
  }

  async obtener(usuarioId: string, partidaId: string, desdeVersion = -1) {
    await this.procesarEstado(partidaId);
    const partida = await this.prisma.partidaTiraAfloja.findUnique({
      where: { id: partidaId },
      include: {
        preguntaActual: {
          include: {
            respuestas: true,
            subtema: { include: { tema: true } },
          },
        },
        preguntas: { orderBy: { orden: 'asc' } },
      },
    });
    if (!partida) throw new NotFoundException('Partida no encontrada.');
    const lado = this.obtenerLado(partida, usuarioId);

    const eventos = await this.prisma.tiraAflojaEvento.findMany({
      where: { partidaId, version: { gt: Math.max(-1, desdeVersion) } },
      orderBy: { version: 'asc' },
      take: 100,
    });
    const respuestasRonda: Array<{ usuarioId: string }> =
      partida.rondaActual > 0
        ? await this.prisma.tiraAflojaRespuesta.findMany({
            where: { partidaId, ronda: partida.rondaActual },
            select: { usuarioId: true },
          })
        : [];

    const preguntaAsignada = partida.preguntas.find(
      (pregunta) => pregunta.orden === partida.rondaActual,
    );
    const ordenOpciones = this.leerIds(preguntaAsignada?.opcionesOrden);
    const snapshot = tugSnapshot(partida);
    const frozen = snapshot?.questions[partida.rondaActual - 1]?.pregunta;
    const preguntaActual = frozen
      ? {
          ...frozen,
          subtema: {
            nombre: frozen.subtema,
            tema: { area: frozen.area, nombre: frozen.tema },
          },
        }
      : partida.preguntaActual;
    const opciones = preguntaActual
      ? [...preguntaActual.respuestas]
          .sort(
            (a, b) => ordenOpciones.indexOf(a.id) - ordenOpciones.indexOf(b.id),
          )
          .map((respuesta) => ({ id: respuesta.id, texto: respuesta.texto }))
      : [];

    return {
      servidorAhora: new Date(),
      partida: {
        id: partida.id,
        estado: partida.estado,
        resultado: partida.resultado,
        area: partida.area,
        lado,
        version: partida.version,
        versionReglas: partida.versionReglas,
        posicionCuerda: partida.posicionCuerda,
        posicionDesdeMiLado:
          lado === 'A' ? partida.posicionCuerda : -partida.posicionCuerda,
        rondaActual: partida.rondaActual,
        totalPreguntas: snapshot?.qPartida ?? partida.preguntas.length,
        listoA: partida.listoA,
        listoB: partida.listoB,
        rondaIniciaEn: partida.rondaIniciaEn,
        rondaVenceEn: partida.rondaVenceEn,
        // Referencias de asiento dentro de esta partida, nunca IDs de cuenta.
        yo: this.presentarJugador(lado),
        rival: partida.jugadorBId
          ? this.presentarJugador(lado === 'A' ? 'B' : 'A')
          : null,
        ganadorId: this.referenciaJugador(partida, partida.ganadorId),
        yaRespondi: respuestasRonda.some(
          (respuesta) => respuesta.usuarioId === usuarioId,
        ),
        pregunta:
          partida.estado === EstadoPartidaTiraAfloja.ACTIVA && preguntaActual
            ? {
                id: preguntaActual.id,
                enunciado: preguntaActual.enunciado,
                imagenUrl: preguntaActual.imagenUrl,
                area: preguntaActual.subtema.tema.area,
                tema: preguntaActual.subtema.tema.nombre,
                subtema: preguntaActual.subtema.nombre,
                opciones,
                tiempoLimiteSegundos: SEGUNDOS_POR_RONDA,
              }
            : null,
      },
      eventos: eventos.map((evento) => ({
        version: evento.version,
        tipo: evento.tipo,
        datos: this.presentarDatosEvento(partida, evento.datos),
        fecha: evento.fecha,
      })),
    };
  }

  private presentarJugador(lado: 'A' | 'B') {
    return { id: lado, nombre: `Jugador ${lado}`, fotoPerfil: null };
  }

  private referenciaJugador(
    partida: { jugadorAId: string; jugadorBId: string | null },
    usuarioId: unknown,
  ): 'A' | 'B' | null {
    if (usuarioId === partida.jugadorAId) return 'A';
    if (partida.jugadorBId && usuarioId === partida.jugadorBId) return 'B';
    return null;
  }

  private presentarDatosEvento(
    partida: { jugadorAId: string; jugadorBId: string | null },
    datos: Prisma.JsonValue,
  ): Record<string, Prisma.JsonValue> {
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return {};
    const publicos: Record<string, Prisma.JsonValue> = {};
    // Lista cerrada: también protege la lectura de eventos históricos.
    for (const campo of [
      'area',
      'ronda',
      'movimiento',
      'motivo',
      'posicionCuerda',
      'respuestaCorrectaId',
      'explicacion',
      'resultado',
      'iniciaEn',
      'venceEn',
    ]) {
      const valor = datos[campo];
      if (
        valor === null ||
        typeof valor === 'string' ||
        typeof valor === 'number' ||
        typeof valor === 'boolean'
      ) {
        publicos[campo] = valor;
      }
    }
    for (const campo of ['jugadorBId', 'abandonoUsuarioId', 'ganadorId']) {
      if (campo in datos) {
        publicos[campo] = this.referenciaJugador(partida, datos[campo]);
      }
    }
    return publicos;
  }

  async marcarListo(usuarioId: string, partidaId: string) {
    await this.procesarEstado(partidaId);
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, `partida:${partidaId}`);
      const partida = await tx.partidaTiraAfloja.findUnique({
        where: { id: partidaId },
      });
      if (!partida) throw new NotFoundException('Partida no encontrada.');
      const lado = this.obtenerLado(partida, usuarioId);
      if (partida.estado !== EstadoPartidaTiraAfloja.PREPARANDO) {
        if (partida.estado === EstadoPartidaTiraAfloja.ACTIVA) return;
        throw new BadRequestException(
          'La partida no esta preparando jugadores.',
        );
      }

      const listoA = partida.listoA || lado === 'A';
      const listoB = partida.listoB || lado === 'B';
      if (!listoA || !listoB) {
        await tx.partidaTiraAfloja.update({
          where: { id: partidaId },
          data: { listoA, listoB },
        });
        return;
      }
      await this.iniciarPrimeraRonda(tx, partida, listoA, listoB);
    });
    this.actualizaciones.notificar(partidaId);
    return this.obtener(usuarioId, partidaId);
  }

  async responder(
    usuarioId: string,
    partidaId: string,
    entrada: ResponderEntrada,
  ) {
    // Only these identifiers are UUIDs; question/option IDs are exact TEXT keys.
    usuarioId = usuarioId.toLowerCase();
    partidaId = partidaId.toLowerCase();
    entrada = {
      ...entrada,
      idempotencyKey: entrada.idempotencyKey.toLowerCase(),
    };
    const repetida = await this.prisma.tiraAflojaRespuesta.findUnique({
      where: { claveIdempotencia: entrada.idempotencyKey },
    });
    if (repetida) {
      this.validarReintento(repetida, usuarioId, partidaId, entrada);
      return this.obtener(usuarioId, partidaId);
    }

    await this.procesarEstado(partidaId);
    let nuevaPresentacion: { id: string; ronda: number } | undefined;
    await this.prisma.$transaction(async (tx) => {
      // Global key first, then match. No other writer waits for a key while
      // holding a match lock. Recheck after waiting, before admitting an action.
      await this.bloquear(tx, `respuesta:${entrada.idempotencyKey}`);
      await this.bloquear(tx, `partida:${partidaId}`);
      const aceptada = await tx.tiraAflojaRespuesta.findUnique({
        where: { claveIdempotencia: entrada.idempotencyKey },
      });
      if (aceptada) {
        this.validarReintento(aceptada, usuarioId, partidaId, entrada);
        return;
      }
      const partida = await tx.partidaTiraAfloja.findUnique({
        where: { id: partidaId },
      });
      if (!partida) throw new NotFoundException('Partida no encontrada.');
      this.obtenerLado(partida, usuarioId);
      let ahora = await this.ahora(tx, partida.evidenciaVersion);
      if (
        partida.estado !== EstadoPartidaTiraAfloja.ACTIVA ||
        !partida.rondaIniciaEn ||
        !partida.rondaVenceEn
      ) {
        throw new BadRequestException('La partida no tiene una ronda activa.');
      }
      if (partida.temporalVersion === 1)
        await this.validarVentanaExacta(tx, partidaId);
      if (partida.temporalVersion !== 1 && ahora < partida.rondaIniciaEn) {
        throw new BadRequestException('La ronda aun no ha comenzado.');
      }
      if (partida.temporalVersion !== 1 && ahora >= partida.rondaVenceEn) {
        throw new BadRequestException('Se agoto el tiempo de la ronda.');
      }
      if (
        partida.temporalVersion !== 1 &&
        partida.evidenciaVersion === 1 &&
        ahora >= partida.expiraEn
      ) {
        throw new BadRequestException('Se agoto el plazo de la partida.');
      }
      if (
        entrada.ronda !== partida.rondaActual ||
        entrada.preguntaId !== partida.preguntaActualId
      ) {
        throw new BadRequestException(
          'La respuesta no pertenece a la ronda actual.',
        );
      }

      const anterior = await tx.tiraAflojaRespuesta.findUnique({
        where: {
          partidaId_ronda_usuarioId: {
            partidaId,
            ronda: entrada.ronda,
            usuarioId,
          },
        },
      });
      if (anterior) {
        throw new BadRequestException(
          'Ya respondiste esta ronda con otra clave.',
        );
      }

      if (await this.registrarPresentacion(tx, partida))
        nuevaPresentacion = { id: partida.id, ronda: partida.rondaActual };
      ahora = await this.ahora(tx, partida.evidenciaVersion);
      if (partida.presenciaVersion === 1)
        ahora = await requireTugPresence(tx, partidaId, usuarioId);
      if (partida.temporalVersion === 1)
        await this.validarVentanaExacta(tx, partidaId);
      // Recording can wait for a PostgreSQL row lock held by another instance.
      // Recheck after that wait; SQL also checks its clock after acquiring the row.
      if (
        partida.temporalVersion !== 1 &&
        partida.evidenciaVersion === 1 &&
        (ahora >= partida.rondaVenceEn || ahora >= partida.expiraEn)
      ) {
        throw new BadRequestException(
          'Se agoto el tiempo de la ronda o partida.',
        );
      }
      const frozenQuestion = tugSnapshot(partida)?.questions[entrada.ronda - 1];
      const opcion = frozenQuestion
        ? frozenQuestion.pregunta.respuestas.find(
            (r) => r.id === entrada.respuestaId,
          )
        : await tx.respuesta.findFirst({
            where: {
              id: entrada.respuestaId,
              preguntaId: entrada.preguntaId,
            },
            select: { esCorrecta: true },
          });
      if (!opcion) {
        throw new BadRequestException(
          'La opcion no pertenece a esta pregunta.',
        );
      }

      await tx.tiraAflojaRespuesta.create({
        data: {
          partidaId,
          ronda: partida.rondaActual,
          usuarioId,
          preguntaId: entrada.preguntaId,
          respuestaSeleccionadaId: entrada.respuestaId,
          esCorrecta: opcion.esCorrecta,
          recibidaEn: ahora,
          claveIdempotencia: entrada.idempotencyKey,
        },
      });
    });

    await this.verificarPresentacionConfirmada(nuevaPresentacion);
    if (nuevaPresentacion) await this.certificarSinRevertirDeporte(partidaId);
    this.actualizaciones.notificar(partidaId);
    await this.procesarEstado(partidaId);
    return this.obtener(usuarioId, partidaId);
  }

  private validarReintento(
    respuesta: {
      partidaId: string;
      usuarioId: string;
      ronda: number;
      preguntaId: string;
      respuestaSeleccionadaId: string;
    },
    usuarioId: string,
    partidaId: string,
    entrada: ResponderEntrada,
  ): void {
    if (
      respuesta.partidaId !== partidaId ||
      respuesta.usuarioId !== usuarioId ||
      respuesta.ronda !== entrada.ronda ||
      respuesta.preguntaId !== entrada.preguntaId ||
      respuesta.respuestaSeleccionadaId !== entrada.respuestaId
    ) {
      throw new ForbiddenException(
        'La clave de la respuesta ya fue utilizada con otra identidad o contenido.',
      );
    }
  }

  async abandonar(usuarioId: string, partidaId: string) {
    const origin = await this.prisma.partidaTiraAfloja.findUnique({
      where: { id: partidaId },
      select: { presenciaVersion: true },
    });
    if (origin?.presenciaVersion === 1) await this.procesarEstado(partidaId);
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, `partida:${partidaId}`);
      const partida = await tx.partidaTiraAfloja.findUnique({
        where: { id: partidaId },
      });
      if (!partida) throw new NotFoundException('Partida no encontrada.');
      const lado = this.obtenerLado(partida, usuarioId);
      if (!ESTADOS_ABIERTOS.includes(partida.estado)) return;
      if (partida.presenciaVersion === 1) {
        await this.cerrarAusencia(tx, partida, [usuarioId], 'EXPLICIT');
        return;
      }
      // Closing never manufactures enablement; only confirmed rows count.

      const sinRival = !partida.jugadorBId;
      const ganadorId = sinRival
        ? null
        : lado === 'A'
          ? partida.jugadorBId
          : partida.jugadorAId;
      const resultado = sinRival
        ? ResultadoPartidaTiraAfloja.CANCELADA
        : lado === 'A'
          ? ResultadoPartidaTiraAfloja.JUGADOR_B
          : ResultadoPartidaTiraAfloja.JUGADOR_A;
      const version = partida.version + 1;
      await tx.partidaTiraAfloja.update({
        where: { id: partidaId },
        data: {
          estado: sinRival
            ? EstadoPartidaTiraAfloja.CANCELADA
            : EstadoPartidaTiraAfloja.FINALIZADA,
          resultado,
          ganadorId,
          fechaFinalizacion: await this.ahora(tx, partida.evidenciaVersion),
          preguntaActualId: null,
          rondaIniciaEn: null,
          rondaVenceEn: null,
          version,
        },
      });
      await this.crearEvento(
        tx,
        partidaId,
        version,
        sinRival
          ? TipoEventoTiraAfloja.CANCELADA
          : TipoEventoTiraAfloja.ABANDONO,
        { abandonoUsuarioId: usuarioId, ganadorId },
      );
    });
    this.actualizaciones.notificar(partidaId);
    return this.obtener(usuarioId, partidaId);
  }

  private async procesarEstado(partidaId: string): Promise<void> {
    let nuevaPresentacion: { id: string; ronda: number } | undefined;
    let certificar = false;
    const cambio = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, `partida:${partidaId}`);
      let partida = await tx.partidaTiraAfloja.findUnique({
        where: { id: partidaId },
      });
      certificar = partida?.certificacionRVersion === 1;
      if (!partida || !ESTADOS_ABIERTOS.includes(partida.estado)) return false;
      let ahora = await this.ahora(tx, partida.evidenciaVersion);
      let presenciaCambio = false;
      if (partida.presenciaVersion === 1) {
        // Catch up earlier frozen round deadlines before deciding grace/global.
        // At most Qpartida rounds: no new presentations are manufactured here.
        while (await this.resolverPresencia(tx, partida)) {
          presenciaCambio = true;
          partida = await tx.partidaTiraAfloja.findUniqueOrThrow({
            where: { id: partidaId },
          });
          if (!ESTADOS_ABIERTOS.includes(partida.estado)) return true;
        }
        ahora = await this.ahora(tx, partida.evidenciaVersion);
      }
      if (await this.registrarPresentacion(tx, partida))
        nuevaPresentacion = { id: partida.id, ronda: partida.rondaActual };

      const globalExpired =
        partida.temporalVersion === 1
          ? (
              await tx.$queryRaw<
                Array<{ due: boolean }>
              >`SELECT "expiraEn"<=tug_presence_now() AS due FROM "PartidaTiraAfloja" WHERE id=${partidaId}::uuid`
            )[0].due
          : partida.expiraEn <= ahora;
      if (globalExpired) {
        const version = partida.version + 1;
        await tx.partidaTiraAfloja.update({
          where: { id: partidaId },
          data: {
            estado: EstadoPartidaTiraAfloja.EXPIRADA,
            resultado: ResultadoPartidaTiraAfloja.CANCELADA,
            fechaFinalizacion: ahora,
            preguntaActualId: null,
            rondaIniciaEn: null,
            rondaVenceEn: null,
            version,
          },
        });
        await this.crearEvento(
          tx,
          partidaId,
          version,
          TipoEventoTiraAfloja.CANCELADA,
          { motivo: 'EXPIRADA' },
        );
        return true;
      }

      if (
        partida.estado !== EstadoPartidaTiraAfloja.ACTIVA ||
        !partida.rondaVenceEn
      ) {
        return false;
      }
      const respuestas = await tx.tiraAflojaRespuesta.findMany({
        where: { partidaId, ronda: partida.rondaActual },
      });
      if (partida.temporalVersion === 1 && respuestas.length < 2) {
        const [clock] = await tx.$queryRaw<
          Array<{ due: boolean }>
        >`SELECT "rondaVenceEn"<=tug_presence_now() AS due FROM "PartidaTiraAfloja" WHERE id=${partidaId}::uuid`;
        if (!clock.due) return presenciaCambio;
      }
      if (respuestas.length < 2 && ahora < partida.rondaVenceEn)
        return presenciaCambio;
      await this.resolverRondaActual(tx, partida, respuestas, ahora);
      return true;
    });
    await this.verificarPresentacionConfirmada(nuevaPresentacion);
    if (certificar) await this.certificarSinRevertirDeporte(partidaId);
    if (cambio) this.actualizaciones.notificar(partidaId);
  }

  private async procesarPartidasVencidas(): Promise<void> {
    if (this.barridoEnCurso) return;
    this.barridoEnCurso = true;
    try {
      const ahora = new Date();
      const partidas = await this.prisma.partidaTiraAfloja.findMany({
        where: {
          OR: [
            {
              estado: EstadoPartidaTiraAfloja.ACTIVA,
              rondaVenceEn: { lte: ahora },
            },
            {
              estado: {
                in: [
                  EstadoPartidaTiraAfloja.BUSCANDO,
                  EstadoPartidaTiraAfloja.PREPARANDO,
                ],
              },
              expiraEn: { lte: ahora },
            },
          ],
        },
        select: { id: true },
        take: 50,
      });
      const presentables = await this.prisma.$queryRaw<
        Array<{ id: string }>
      >(Prisma.sql`
        SELECT m.id FROM "PartidaTiraAfloja" m
        WHERE m.estado='ACTIVA' AND m."evidenciaVersion"=1
          AND m."rondaIniciaEn" <= (clock_timestamp() AT TIME ZONE 'UTC')
          AND (clock_timestamp() AT TIME ZONE 'UTC') < least(m."rondaVenceEn",m."expiraEn")
          AND (SELECT count(*) FROM "TiraAflojaRondaPresentada" r
            WHERE r."partidaId"=m.id AND r.ronda=m."rondaActual") < 2
        ORDER BY m."rondaIniciaEn", m.id LIMIT 50`);
      const presencia = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT m.id FROM "PartidaTiraAfloja" m WHERE m."presenciaVersion"=1
          AND m.estado IN ('BUSCANDO','PREPARANDO','ACTIVA') AND
          (m."expiraEn"<=tug_presence_now() OR EXISTS(SELECT 1 FROM "TugPresence" p WHERE p."matchId"=m.id
            AND p."graceUntil"<=tug_presence_now()) OR
           EXISTS(SELECT 1 FROM "TugConnection" c WHERE c."matchId"=m.id
            AND c.state='OPEN' AND c."leaseUntil"<=tug_presence_now()))
        ORDER BY m.id LIMIT 50`;
      // Recovery only while a real PostgreSQL observation is still possible.
      const certificables = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT m.id FROM "PartidaTiraAfloja" m
        JOIN "TiraAflojaRondaPresentada" r ON r."partidaId"=m.id
        WHERE m."certificacionRVersion"=1
          AND timezone('UTC',clock_timestamp())<least(r."venceEn",m."expiraEn")
          AND NOT EXISTS(SELECT 1 FROM "TugRoundVisibility" c
            WHERE c."partidaId"=m.id AND c.ronda=r.ronda)
        ORDER BY m.id LIMIT 50`;
      // Do not enqueue the whole batch as interactive transactions: even a
      // one-connection pool must release each sports transaction AND finish its
      // independent post-COMMIT witness before scheduling the next match.
      // Observe committed evidence first, while its original deadline permits.
      const ids = [
        ...new Set(
          [...certificables, ...presentables, ...partidas, ...presencia].map(
            (p) => p.id,
          ),
        ),
      ];
      for (const id of ids) {
        try {
          await this.procesarEstado(id);
        } catch (error) {
          this.log.error(
            JSON.stringify({
              event: 'TUG_RECOVERY_PENDING',
              partidaId: id,
              code: error?.code ?? 'RECOVERY_ERROR',
              sqlState: error?.meta?.code ?? null,
              transactionError:
                error?.code === 'P2028' ? error?.meta?.error : undefined,
              reason: 'Durable work retained; verify schema/database',
            }),
          );
        }
      }
    } finally {
      this.barridoEnCurso = false;
    }
  }

  private async resolverPresencia(
    tx: ClienteTransaccion,
    partida: Awaited<
      ReturnType<ClienteTransaccion['partidaTiraAfloja']['findUniqueOrThrow']>
    >,
  ): Promise<boolean> {
    await tx.$queryRaw`SELECT tug_presence_refresh(${partida.id}::uuid,NULL::timestamp)`;
    if (partida.estado !== EstadoPartidaTiraAfloja.ACTIVA) return false;
    const respuestas = await tx.tiraAflojaRespuesta.findMany({
      where: { partidaId: partida.id, ronda: partida.rondaActual },
    });
    // PostgreSQL compares microseconds; JS Date cannot distinguish two grace
    // deadlines within the same millisecond. Carry exact text for terminal SQL.
    const [candidate] = await tx.$queryRaw<
      {
        roundAt: Date | null;
        roundFirst: boolean;
        globalFirst: boolean;
        graceDue: boolean;
        absent: string[];
      }[]
    >`
      WITH g AS (SELECT min("graceUntil") AS at FROM "TugPresence" WHERE "matchId"=${partida.id}::uuid),
      m AS (SELECT * FROM "PartidaTiraAfloja" WHERE id=${partida.id}::uuid),
      r AS (SELECT CASE WHEN count(*)=2 THEN max("recibidaEn") ELSE (SELECT "rondaVenceEn" FROM m) END AS at
        FROM "TiraAflojaRespuesta" WHERE "partidaId"=${partida.id}::uuid AND ronda=${partida.rondaActual})
      SELECT r.at AS "roundAt",
        coalesce(r.at<=tug_presence_now() AND r.at<least(g.at,(SELECT "expiraEn" FROM m)),false) AS "roundFirst",
        coalesce((SELECT "expiraEn" FROM m)<=tug_presence_now() AND
          (g.at IS NULL OR (SELECT "expiraEn" FROM m)<=g.at),false) AS "globalFirst",
        coalesce(g.at<=tug_presence_now(),false) AS "graceDue",
        ARRAY(SELECT "userId"::text FROM "TugPresence" WHERE "matchId"=${partida.id}::uuid AND "graceUntil"=g.at ORDER BY "userId") AS absent
      FROM g CROSS JOIN r`;
    if (candidate.roundFirst && candidate.roundAt) {
      await this.resolverRondaActual(
        tx,
        partida,
        respuestas,
        candidate.roundAt,
      );
      return true;
    }
    if (candidate.globalFirst) {
      // Existing global-expiry result is CANCELADA, not an invented normal win.
      await tx.partidaTiraAfloja.update({
        where: { id: partida.id },
        data: {
          estado: EstadoPartidaTiraAfloja.EXPIRADA,
          resultado: ResultadoPartidaTiraAfloja.CANCELADA,
          ganadorId: null,
          fechaFinalizacion: partida.expiraEn,
          preguntaActualId: null,
          rondaIniciaEn: null,
          rondaVenceEn: null,
          version: { increment: 1 },
        },
      });
      await this.crearEvento(
        tx,
        partida.id,
        partida.version + 1,
        TipoEventoTiraAfloja.CANCELADA,
        { motivo: 'EXPIRADA' },
      );
      return true;
    }
    if (candidate.graceDue) {
      await this.cerrarAusencia(tx, partida, candidate.absent, 'GRACE');
      return true;
    }
    return false;
  }

  private async cerrarAusencia(
    tx: ClienteTransaccion,
    partida: Awaited<
      ReturnType<ClienteTransaccion['partidaTiraAfloja']['findUniqueOrThrow']>
    >,
    absent: string[],
    reason: 'GRACE' | 'EXPLICIT',
  ) {
    const [time] = await tx.$queryRaw<{ at: string }[]>`
      SELECT CASE WHEN ${reason}='GRACE' THEN min("graceUntil")
        ELSE tug_presence_now() END::text AS at
      FROM "TugPresence" WHERE "matchId"=${partida.id}::uuid`;
    const rival =
      absent.length === 1
        ? absent[0] === partida.jugadorAId
          ? partida.jugadorBId
          : partida.jugadorAId
        : null;
    // GRACE candidates already exclude earlier/simultaneous rival grace and
    // priority normal terminals. UNKNOWN never cancels the sporting victory.
    // Keep the existing EXPLICIT contract; reward eligibility is separate.
    let ganadorId = rival;
    if (reason === 'EXPLICIT') {
      const [presence] = await tx.$queryRaw<{ valid: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM "TugConnection" c
        WHERE c."matchId"=${partida.id}::uuid AND c."userId"=${rival}::uuid
          AND c.state='OPEN' AND c."leaseUntil">tug_presence_now()
          AND NOT EXISTS(SELECT 1 FROM "TugPresence" p WHERE p."matchId"=c."matchId" AND p."userId"=c."userId" AND p."graceUntil" IS NOT NULL)
          AND (${reason}='EXPLICIT' OR c."lastSeenAt">(
            SELECT "disconnectedAt" FROM "TugPresence" WHERE "matchId"=${partida.id}::uuid AND "userId"=${absent[0]}::uuid))) AS valid`;
      ganadorId = presence.valid ? rival : null;
    }
    const resultado =
      ganadorId === partida.jugadorAId
        ? 'JUGADOR_A'
        : ganadorId && ganadorId === partida.jugadorBId
          ? 'JUGADOR_B'
          : 'CANCELADA';
    for (const userId of absent) {
      await tx.$executeRaw`INSERT INTO "TugPresence"("matchId","userId") VALUES(${partida.id}::uuid,${userId}::uuid) ON CONFLICT DO NOTHING`;
      await tx.$executeRaw`INSERT INTO "TugAbandonment"("matchId","userId","effectiveAt",reason)
        VALUES(${partida.id}::uuid,${userId}::uuid,${time.at}::timestamp,${reason}) ON CONFLICT DO NOTHING`;
      await tx.$executeRaw`INSERT INTO "TugPresenceEvent"("matchId","userId",kind,"observedAt")
        VALUES(${partida.id}::uuid,${userId}::uuid,'ABANDONED',${time.at}::timestamp)`;
    }
    await tx.$executeRaw`UPDATE "PartidaTiraAfloja" SET
      estado=${ganadorId ? 'FINALIZADA' : 'CANCELADA'}::"EstadoPartidaTiraAfloja",
      resultado=${resultado}::"ResultadoPartidaTiraAfloja","ganadorId"=${ganadorId}::uuid,
      "fechaFinalizacion"=${time.at}::timestamp,"preguntaActualId"=NULL,"rondaIniciaEn"=NULL,"rondaVenceEn"=NULL,version=version+1
      WHERE id=${partida.id}::uuid`;
    await this.crearEvento(
      tx,
      partida.id,
      partida.version + 1,
      TipoEventoTiraAfloja.ABANDONO,
      {
        motivo: reason,
        abandonoUsuarioId: absent.length === 1 ? absent[0] : null,
        ganadorId,
      },
    );
  }

  private async resolverRondaActual(
    tx: ClienteTransaccion,
    partida: Awaited<
      ReturnType<ClienteTransaccion['partidaTiraAfloja']['findUniqueOrThrow']>
    >,
    respuestas: Array<{
      usuarioId: string;
      esCorrecta: boolean;
      recibidaEn: Date;
    }>,
    ahora: Date,
  ) {
    const respuestaA = respuestas.find(
      (respuesta) => respuesta.usuarioId === partida.jugadorAId,
    );
    const respuestaB = respuestas.find(
      (respuesta) => respuesta.usuarioId === partida.jugadorBId,
    );
    const exact =
      partida.temporalVersion === 1
        ? await tx.$queryRaw<
            Array<{ usuarioId: string; esCorrecta: boolean; atUs: string }>
          >`
          SELECT "usuarioId", "esCorrecta", (extract(epoch FROM "recibidaEn")*1000000)::bigint::text AS "atUs"
          FROM "TiraAflojaRespuesta" WHERE "partidaId"=${partida.id}::uuid AND ronda=${partida.rondaActual}`
        : null;
    const resolucion = exact
      ? resolverRondaExacta(
          exact.find((a) => a.usuarioId === partida.jugadorAId),
          exact.find((a) => a.usuarioId === partida.jugadorBId),
        )
      : resolverRonda(
          respuestaA
            ? {
                esCorrecta: respuestaA.esCorrecta,
                recibidaEnMs: respuestaA.recibidaEn.getTime(),
              }
            : undefined,
          respuestaB
            ? {
                esCorrecta: respuestaB.esCorrecta,
                recibidaEnMs: respuestaB.recibidaEn.getTime(),
              }
            : undefined,
        );
    const posicion = moverCuerda(partida.posicionCuerda, resolucion.movimiento);
    const frozenQuestion =
      tugSnapshot(partida)?.questions[partida.rondaActual - 1]?.pregunta;
    const pregunta = frozenQuestion
      ? {
          explicacion: frozenQuestion.explicacion,
          respuestas: frozenQuestion.respuestas.filter((r) => r.esCorrecta),
        }
      : await tx.pregunta.findUnique({
          where: { id: partida.preguntaActualId ?? '' },
          select: {
            explicacion: true,
            respuestas: { where: { esCorrecta: true }, select: { id: true } },
          },
        });
    const versionResolucion = partida.version + 1;
    await this.crearEvento(
      tx,
      partida.id,
      versionResolucion,
      TipoEventoTiraAfloja.RONDA_RESUELTA,
      {
        ronda: partida.rondaActual,
        movimiento: resolucion.movimiento,
        motivo: resolucion.motivo,
        posicionCuerda: posicion,
        respuestaCorrectaId: pregunta?.respuestas[0]?.id ?? null,
        explicacion: pregunta?.explicacion ?? null,
      },
    );

    const ganadorMeta = ganadorPorPosicion(posicion);
    const siguiente = await tx.tiraAflojaPregunta.findUnique({
      where: {
        partidaId_orden: {
          partidaId: partida.id,
          orden: partida.rondaActual + 1,
        },
      },
    });
    if (ganadorMeta || !siguiente) {
      const resultado = ganadorMeta ?? resultadoPorPreguntasAgotadas(posicion);
      const ganadorId =
        resultado === ResultadoPartidaTiraAfloja.JUGADOR_A
          ? partida.jugadorAId
          : resultado === ResultadoPartidaTiraAfloja.JUGADOR_B
            ? partida.jugadorBId
            : null;
      const versionFinal = versionResolucion + 1;
      await tx.partidaTiraAfloja.update({
        where: { id: partida.id },
        data: {
          estado: EstadoPartidaTiraAfloja.FINALIZADA,
          resultado,
          ganadorId,
          posicionCuerda: posicion,
          fechaFinalizacion: ahora,
          preguntaActualId: null,
          rondaIniciaEn: null,
          rondaVenceEn: null,
          version: versionFinal,
        },
      });
      await this.crearEvento(
        tx,
        partida.id,
        versionFinal,
        TipoEventoTiraAfloja.FINALIZADA,
        { resultado, ganadorId, posicionCuerda: posicion },
      );
      return;
    }

    const iniciaEn = new Date(ahora.getTime() + PAUSA_ENTRE_RONDAS_MS);
    const venceEn = new Date(iniciaEn.getTime() + SEGUNDOS_POR_RONDA * 1000);
    const versionSiguiente = versionResolucion + 1;
    await tx.partidaTiraAfloja.update({
      where: { id: partida.id },
      data: {
        posicionCuerda: posicion,
        rondaActual: siguiente.orden,
        preguntaActualId: siguiente.preguntaId,
        rondaIniciaEn: iniciaEn,
        rondaVenceEn: venceEn,
        version: versionSiguiente,
      },
    });
    await this.crearEvento(
      tx,
      partida.id,
      versionSiguiente,
      TipoEventoTiraAfloja.RONDA_INICIADA,
      {
        ronda: siguiente.orden,
        iniciaEn: iniciaEn.toISOString(),
        venceEn: venceEn.toISOString(),
      },
    );
  }

  private async certificarSinRevertirDeporte(partidaId: string): Promise<void> {
    try {
      await this.visibilityWitness.certify(partidaId);
    } catch (error) {
      // Only the independent post-COMMIT witness is isolated. Sports/schema
      // errors in the original transaction still propagate to the caller.
      this.log.error(
        JSON.stringify({
          event: 'TUG_VISIBILITY_PENDING',
          partidaId,
          code: error?.code ?? 'WITNESS_ERROR',
          sqlState: error?.meta?.code ?? null,
          detail:
            typeof error?.meta?.message === 'string'
              ? error.meta.message
              : null,
          reason:
            error?.message === 'TUG_WITNESS_DATABASE_MISMATCH'
              ? error.message
              : 'Independent witness failed; certificate remains absent',
        }),
      );
    }
  }

  private async iniciarPrimeraRonda(
    tx: ClienteTransaccion,
    partida: Awaited<
      ReturnType<ClienteTransaccion['partidaTiraAfloja']['findUniqueOrThrow']>
    >,
    listoA: boolean,
    listoB: boolean,
  ) {
    let snapshotData: Pick<
      Prisma.PartidaTiraAflojaUpdateInput,
      'evidenciaVersion' | 'qPartida' | 'snapshotInicial'
    > = {};
    if (partida.prepararEvidencia) {
      // Protect the bank while reconstructing its original content; assignment
      // and both participants are fixed under the existing match lock.
      await tx.$queryRaw(
        Prisma.sql`SELECT p.id FROM "Pregunta" p JOIN "TiraAflojaPregunta" a ON a."preguntaId"=p.id WHERE a."partidaId"=${partida.id}::uuid ORDER BY p.id FOR SHARE OF p`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT r.id FROM "Respuesta" r JOIN "TiraAflojaPregunta" a ON a."preguntaId"=r."preguntaId" WHERE a."partidaId"=${partida.id}::uuid ORDER BY r.id FOR SHARE OF r`,
      );
      const assigned = await tx.tiraAflojaPregunta.findMany({
        where: { partidaId: partida.id },
        orderBy: { orden: 'asc' },
        include: { pregunta: { include: TUG_QUESTION_INCLUDE } },
      });
      const snapshot = buildTugSnapshot(partida, assigned);
      if (partida.temporalVersion === 1) {
        const [time] = await tx.$queryRaw<
          Array<{ expiry: string }>
        >`SELECT to_char("expiraEn",'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expiry FROM "PartidaTiraAfloja" WHERE id=${partida.id}::uuid`;
        snapshot.config.expiraEn = time.expiry;
      }
      snapshotData = {
        evidenciaVersion: 1,
        qPartida: snapshot.qPartida,
        snapshotInicial: snapshot as unknown as Prisma.InputJsonValue,
      };
    }
    const primera = await tx.tiraAflojaPregunta.findUnique({
      where: { partidaId_orden: { partidaId: partida.id, orden: 1 } },
    });
    if (!primera) {
      throw new BadRequestException(
        'La partida no tiene preguntas suficientes.',
      );
    }
    const ahora = await this.ahora(tx, partida.prepararEvidencia ? 1 : null);
    const iniciaEn = new Date(ahora.getTime() + CUENTA_REGRESIVA_INICIAL_MS);
    const venceEn = new Date(iniciaEn.getTime() + SEGUNDOS_POR_RONDA * 1000);
    const version = partida.version + 1;
    await tx.partidaTiraAfloja.update({
      where: { id: partida.id },
      data: {
        ...snapshotData,
        estado: EstadoPartidaTiraAfloja.ACTIVA,
        listoA,
        listoB,
        rondaActual: 1,
        preguntaActualId: primera.preguntaId,
        rondaIniciaEn: iniciaEn,
        rondaVenceEn: venceEn,
        version,
      },
    });
    await this.crearEvento(
      tx,
      partida.id,
      version,
      TipoEventoTiraAfloja.RONDA_INICIADA,
      {
        ronda: 1,
        iniciaEn: iniciaEn.toISOString(),
        venceEn: venceEn.toISOString(),
      },
    );
  }

  private async seleccionarPreguntas(area?: AreaIcfes) {
    const candidatas = await this.prisma.pregunta.findMany({
      where: preguntaPublicadaWhere({
        ...(area ? { subtema: { tema: { area } } } : {}),
        respuestas: { some: { esCorrecta: true } },
      }),
      include: { respuestas: { select: { id: true, esCorrecta: true } } },
      take: 100,
    });
    const validas = candidatas.filter(
      (pregunta) => pregunta.respuestas.length >= 2,
    );
    if (validas.length < MINIMO_PREGUNTAS) {
      throw new BadRequestException(
        `Se necesitan al menos ${MINIMO_PREGUNTAS} preguntas validas para jugar.`,
      );
    }
    return mezclar(validas).slice(0, PREGUNTAS_POR_PARTIDA);
  }

  private async validarEstudiante(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (usuario.rol !== RolUsuario.ESTUDIANTE) {
      throw new ForbiddenException('Este juego es para cuentas de estudiante.');
    }
  }

  private async ahora(
    tx: ClienteTransaccion,
    evidenceVersion: number | null | undefined,
  ): Promise<Date> {
    if (evidenceVersion !== 1) return new Date();
    const [row] = await tx.$queryRaw<Array<{ ahora: Date }>>(
      Prisma.sql`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS ahora`,
    );
    return row.ahora;
  }

  private async validarVentanaExacta(tx: ClienteTransaccion, id: string) {
    const [window] = await tx.$queryRaw<Array<{ valid: boolean }>>`
      SELECT estado='ACTIVA' AND "rondaIniciaEn"<=tug_presence_now()
        AND tug_presence_now()<least("rondaVenceEn","expiraEn") AS valid
      FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
    if (!window?.valid)
      throw new BadRequestException(
        'La ventana autoritativa de respuesta no esta activa.',
      );
  }

  private async registrarPresentacion(
    tx: ClienteTransaccion,
    partida: { id: string; evidenciaVersion?: number | null },
  ): Promise<boolean> {
    if (partida.evidenciaVersion !== 1) return false;
    const [row] = await tx.$queryRaw<Array<{ registrada: boolean }>>(
      Prisma.sql`SELECT tug_record_presented_round(${partida.id}::uuid) AS registrada`,
    );
    return row.registrada;
  }

  private async verificarPresentacionConfirmada(
    nueva: { id: string; ronda: number } | undefined,
  ): Promise<void> {
    if (!nueva) return;
    // Prisma 5 can resolve an interactive transaction despite a deferred
    // constraint rejecting COMMIT. Never report that rolled-back transition.
    const count = await this.prisma.tiraAflojaRondaPresentada.count({
      where: { partidaId: nueva.id, ronda: nueva.ronda },
    });
    if (count !== 2)
      throw new BadRequestException(
        'La habilitacion no pudo confirmarse dentro del plazo.',
      );
  }

  private buscarActiva(
    usuarioId: string,
    cliente: PrismaService | ClienteTransaccion = this.prisma,
  ) {
    return cliente.partidaTiraAfloja.findFirst({
      where: {
        estado: { in: ESTADOS_ABIERTOS },
        expiraEn: { gt: new Date() },
        OR: [{ jugadorAId: usuarioId }, { jugadorBId: usuarioId }],
      },
      orderBy: { fechaCreacion: 'desc' },
    });
  }

  private obtenerLado(
    partida: { jugadorAId: string; jugadorBId: string | null },
    usuarioId: string,
  ): 'A' | 'B' {
    if (partida.jugadorAId === usuarioId) return 'A';
    if (partida.jugadorBId === usuarioId) return 'B';
    throw new ForbiddenException('No perteneces a esta partida.');
  }

  private async bloquear(tx: ClienteTransaccion, clave: string) {
    // All writers use the same lock for equivalent PostgreSQL UUID spellings.
    clave = clave.replace(
      /^(partida|respuesta):([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i,
      (_, tipo: string, id: string) =>
        `${tipo.toLowerCase()}:${id.toLowerCase()}`,
    );
    if (clave.startsWith('partida:')) {
      const id = clave.slice('partida:'.length);
      // No key is acquired while holding these locks. Historical matches keep
      // their old lock contract; new presence uses sorted Usuario -> match.
      await tx.$queryRaw(Prisma.sql`
        SELECT u.id FROM "Usuario" u JOIN "PartidaTiraAfloja" m
          ON u.id IN (m."jugadorAId",m."jugadorBId")
        WHERE m.id=${id}::uuid AND m."presenciaVersion"=1
        ORDER BY u.id FOR UPDATE OF u`);
    }
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${clave}))::text`,
    );
  }

  private crearEvento(
    tx: ClienteTransaccion,
    partidaId: string,
    version: number,
    tipo: TipoEventoTiraAfloja,
    datos: Prisma.InputJsonValue,
  ) {
    return tx.tiraAflojaEvento.create({
      data: { partidaId, version, tipo, datos },
    });
  }

  private leerIds(valor: Prisma.JsonValue | undefined): string[] {
    return Array.isArray(valor)
      ? valor.filter(
          (elemento): elemento is string => typeof elemento === 'string',
        )
      : [];
  }
}
