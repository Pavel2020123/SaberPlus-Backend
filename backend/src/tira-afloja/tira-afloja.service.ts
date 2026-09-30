import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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
import {
  ganadorPorPosicion,
  moverCuerda,
  resolverRonda,
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly actualizaciones: TiraAflojaRealtimePublisher,
  ) {}

  onModuleInit(): void {
    this.temporizador = setInterval(() => {
      void this.procesarPartidasVencidas();
    }, 1000);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
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

      const candidata = await tx.partidaTiraAfloja.findFirst({
        where: {
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

      const creada = await tx.partidaTiraAfloja.create({
        data: {
          jugadorAId: usuarioId,
          area,
          expiraEn: sumarMinutos(ahora, MINUTOS_BUSQUEDA),
          preguntas: {
            create: preguntas.map((pregunta, indice) => ({
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
    const opciones = partida.preguntaActual
      ? [...partida.preguntaActual.respuestas]
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
        totalPreguntas: partida.preguntas.length,
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
          partida.estado === EstadoPartidaTiraAfloja.ACTIVA &&
          partida.preguntaActual
            ? {
                id: partida.preguntaActual.id,
                enunciado: partida.preguntaActual.enunciado,
                imagenUrl: partida.preguntaActual.imagenUrl,
                area: partida.preguntaActual.subtema.tema.area,
                tema: partida.preguntaActual.subtema.tema.nombre,
                subtema: partida.preguntaActual.subtema.nombre,
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
    const repetida = await this.prisma.tiraAflojaRespuesta.findUnique({
      where: { claveIdempotencia: entrada.idempotencyKey },
    });
    if (repetida) {
      if (
        repetida.partidaId !== partidaId ||
        repetida.usuarioId !== usuarioId
      ) {
        throw new ForbiddenException(
          'La clave de la respuesta ya fue utilizada.',
        );
      }
      return this.obtener(usuarioId, partidaId);
    }

    await this.procesarEstado(partidaId);
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, `partida:${partidaId}`);
      const partida = await tx.partidaTiraAfloja.findUnique({
        where: { id: partidaId },
      });
      if (!partida) throw new NotFoundException('Partida no encontrada.');
      this.obtenerLado(partida, usuarioId);
      const ahora = new Date();
      if (
        partida.estado !== EstadoPartidaTiraAfloja.ACTIVA ||
        !partida.rondaIniciaEn ||
        !partida.rondaVenceEn
      ) {
        throw new BadRequestException('La partida no tiene una ronda activa.');
      }
      if (ahora < partida.rondaIniciaEn) {
        throw new BadRequestException('La ronda aun no ha comenzado.');
      }
      if (ahora >= partida.rondaVenceEn) {
        throw new BadRequestException('Se agoto el tiempo de la ronda.');
      }
      if (
        entrada.ronda !== partida.rondaActual ||
        entrada.preguntaId !== partida.preguntaActualId
      ) {
        throw new BadRequestException(
          'La respuesta no pertenece a la ronda actual.',
        );
      }

      const opcion = await tx.respuesta.findFirst({
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

    this.actualizaciones.notificar(partidaId);
    await this.procesarEstado(partidaId);
    return this.obtener(usuarioId, partidaId);
  }

  async abandonar(usuarioId: string, partidaId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, `partida:${partidaId}`);
      const partida = await tx.partidaTiraAfloja.findUnique({
        where: { id: partidaId },
      });
      if (!partida) throw new NotFoundException('Partida no encontrada.');
      const lado = this.obtenerLado(partida, usuarioId);
      if (!ESTADOS_ABIERTOS.includes(partida.estado)) return;

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
          fechaFinalizacion: new Date(),
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
    const cambio = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, `partida:${partidaId}`);
      const partida = await tx.partidaTiraAfloja.findUnique({
        where: { id: partidaId },
      });
      if (!partida || !ESTADOS_ABIERTOS.includes(partida.estado)) return false;
      const ahora = new Date();

      if (partida.expiraEn <= ahora) {
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
      if (respuestas.length < 2 && ahora < partida.rondaVenceEn) return false;
      await this.resolverRondaActual(tx, partida, respuestas, ahora);
      return true;
    });
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
      await Promise.allSettled(
        partidas.map((partida) => this.procesarEstado(partida.id)),
      );
    } finally {
      this.barridoEnCurso = false;
    }
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
    const resolucion = resolverRonda(
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
    const pregunta = await tx.pregunta.findUnique({
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

  private async iniciarPrimeraRonda(
    tx: ClienteTransaccion,
    partida: Awaited<
      ReturnType<ClienteTransaccion['partidaTiraAfloja']['findUniqueOrThrow']>
    >,
    listoA: boolean,
    listoB: boolean,
  ) {
    const primera = await tx.tiraAflojaPregunta.findUnique({
      where: { partidaId_orden: { partidaId: partida.id, orden: 1 } },
    });
    if (!primera) {
      throw new BadRequestException(
        'La partida no tiene preguntas suficientes.',
      );
    }
    const iniciaEn = new Date(Date.now() + CUENTA_REGRESIVA_INICIAL_MS);
    const venceEn = new Date(iniciaEn.getTime() + SEGUNDOS_POR_RONDA * 1000);
    const version = partida.version + 1;
    await tx.partidaTiraAfloja.update({
      where: { id: partida.id },
      data: {
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
      include: { respuestas: { select: { id: true } } },
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
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${clave}))`,
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
