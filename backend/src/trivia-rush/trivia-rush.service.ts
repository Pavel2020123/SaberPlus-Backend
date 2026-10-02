import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AreaIcfes,
  Dificultad,
  EstadoConcesionRecompensa,
  EstadoIntentoTriviaRush,
  OrigenRespuesta,
  ModalidadTriviaRush,
  Prisma,
  RolUsuario,
  TipoPotenciadorTriviaRush,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { preguntaPublicadaWhere } from '../common/contenido-publicado';
import {
  freezeQuestion,
  readTriviaSnapshot,
  snapshotQuestionInclude,
  TriviaSnapshot,
} from './trivia-rush.snapshot';
import {
  esDuracionTriviaRushValida,
  intentoTriviaRushVencido,
  milisegundosRespuestaTriviaRush,
  registrarSaltoTriviaRush,
  resolverRespuestaTriviaRush,
  SEGUNDOS_TIEMPO_EXTRA,
  VERSION_REGLAS_TRIVIA_RUSH,
} from './trivia-rush.rules';

const PREGUNTAS_OBJETIVO = 30;
const PREGUNTAS_POR_DIFICULTAD = 10;
const MINIMO_PREGUNTAS = 4;

interface CrearTriviaRushEntrada {
  modalidad?: ModalidadTriviaRush;
  areas: AreaIcfes[];
  duracionSegundos: number;
}

interface ResponderTriviaRushEntrada {
  preguntaId: string;
  respuestaId: string;
  idempotencyKey: string;
}

interface ActivarPotenciadorEntrada {
  preguntaId: string;
  potenciador: TipoPotenciadorTriviaRush;
  concesionId: string;
  idempotencyKey: string;
}

type ClienteTransaccion = Prisma.TransactionClient;
type IntentoTriviaRushBase = Prisma.IntentoTriviaRushGetPayload<object>;
type RespuestaRepetida = Prisma.TriviaRushRespuestaGetPayload<{
  include: { intento: { select: { usuarioId: true } } };
}>;
type PotenciadorRepetido = Prisma.TriviaRushPotenciadorGetPayload<{
  include: { intento: { select: { usuarioId: true } } };
}>;
type IntentoTriviaRushCompleto = Prisma.IntentoTriviaRushGetPayload<{
  include: {
    preguntas: {
      include: {
        pregunta: {
          include: {
            respuestas: true;
            subtema: { include: { tema: true } };
            caso: { select: { contexto: true; imagenUrl: true } };
          };
        };
      };
    };
    respuestas: true;
    potenciadores: true;
  };
}>;
type PreguntaTriviaRushCompleta =
  IntentoTriviaRushCompleto['preguntas'][number];

export interface RevisionTriviaRush {
  preguntaId: string;
  respuestaSeleccionadaId: string | null;
  respuestaCorrectaId: string | null;
  esCorrecta: boolean;
  saltada: boolean;
  explicacion: string | null;
  area: AreaIcfes;
  tema: string;
  subtema: string;
  subtemaId: string;
}

export interface DiagnosticoTriviaRush {
  area: AreaIcfes;
  tema: string;
  subtema: string;
  subtemaId: string;
  errores: number;
}

import {
  requireTriviaPresence,
  resolveTriviaPresence,
} from './trivia-presence.service';

function mezclar<T>(elementos: T[]): T[] {
  const copia = [...elementos];
  for (let indice = copia.length - 1; indice > 0; indice -= 1) {
    const destino = Math.floor(Math.random() * (indice + 1));
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  }
  return copia;
}

@Injectable()
export class TriviaRushService {
  constructor(private readonly prisma: PrismaService) {}

  async crear(usuarioId: string, entrada: CrearTriviaRushEntrada) {
    if (
      entrada.modalidad !== undefined &&
      !Object.values(ModalidadTriviaRush).includes(entrada.modalidad)
    )
      throw new BadRequestException('Modalidad invalida.');
    await this.validarEstudiante(usuarioId);
    if (!esDuracionTriviaRushValida(entrada.duracionSegundos)) {
      throw new BadRequestException('La duracion de Trivia Rush no es valida.');
    }
    const areas = this.normalizarAreas(entrada.areas);
    if (areas.length === 0) {
      throw new BadRequestException('Selecciona al menos un area.');
    }
    const intentoId = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, `trivia-rush:usuario:${usuarioId}`);
      await this.bloquearUsuario(tx, usuarioId);
      const ahora = new Date();
      let activa = await tx.intentoTriviaRush.findFirst({
        where: { usuarioId, estado: EstadoIntentoTriviaRush.ACTIVO },
        orderBy: { iniciadoEn: 'desc' },
      });
      if (activa?.presenciaVersion === 1) {
        await resolveTriviaPresence(tx, activa.id);
        activa = await tx.intentoTriviaRush.findFirst({
          where: { id: activa.id, estado: 'ACTIVO' },
        });
      }
      if (activa && intentoTriviaRushVencido(activa.venceEn, ahora)) {
        await tx.intentoTriviaRush.update({
          where: { id: activa.id },
          data: {
            estado: EstadoIntentoTriviaRush.EXPIRADO,
            finalizadoEn:
              activa.evidenciaVersion === 1 ? activa.venceEn : ahora,
            preguntaActualId: null,
            preguntaIniciaEn: null,
          },
        });
      } else if (activa) {
        if (
          entrada.modalidad !== undefined &&
          entrada.modalidad !== activa.modalidad
        )
          throw new ConflictException('La modalidad del intento es inmutable.');
        if (
          activa.duracionBaseSegundos === entrada.duracionSegundos &&
          this.mismasAreas(activa.areas, areas)
        ) {
          return activa.id;
        }
        throw new ConflictException(
          'Ya tienes un Trivia Rush activo. Continualo o abandonalo antes de cambiar la configuracion.',
        );
      }

      const preguntas = await this.seleccionarPreguntas(areas, tx);
      const asignadas = preguntas.map((p, orden) =>
        freezeQuestion(p, orden, mezclar(p.respuestas.map((r) => r.id))),
      );
      let snapshot: TriviaSnapshot | undefined;
      if (entrada.modalidad) {
        if (preguntas.length < 10 || preguntas.length > 30)
          throw new BadRequestException(
            'La evidencia V1 requiere entre 10 y 30 preguntas validas.',
          );
        snapshot = {
          version: 1,
          q: preguntas.length,
          config: {
            areas,
            duracionSegundos: entrada.duracionSegundos,
            versionReglas: VERSION_REGLAS_TRIVIA_RUSH,
            modalidad: entrada.modalidad,
          },
          questions: asignadas,
          ghost: null,
        };
        if (entrada.modalidad === 'GHOST_DUEL')
          snapshot.ghost = await this.fijarFantasma(tx, usuarioId, snapshot);
      }
      const inicio = new Date();
      const creada = await tx.intentoTriviaRush.create({
        data: {
          usuarioId,
          ...(snapshot
            ? {
                evidenciaVersion: 1,
                presenciaVersion: 1,
                modalidad: entrada.modalidad,
                snapshotInicial: snapshot as unknown as Prisma.InputJsonValue,
              }
            : {}),
          areas,
          duracionBaseSegundos: entrada.duracionSegundos,
          versionReglas: VERSION_REGLAS_TRIVIA_RUSH,
          iniciadoEn: inicio,
          venceEn: new Date(inicio.getTime() + entrada.duracionSegundos * 1000),
          preguntaActualId: preguntas[0].id,
          preguntaIniciaEn: inicio,
          preguntas: {
            create: asignadas.map(({ preguntaId, orden, opcionesOrden }) => ({
              preguntaId,
              orden,
              opcionesOrden,
            })),
          },
        },
        select: { id: true },
      });
      return creada.id;
    });

    return this.obtener(usuarioId, intentoId);
  }

  async obtenerActivo(usuarioId: string) {
    await this.validarEstudiante(usuarioId);
    const candidata = await this.prisma.intentoTriviaRush.findFirst({
      where: { usuarioId, estado: EstadoIntentoTriviaRush.ACTIVO },
      orderBy: { iniciadoEn: 'desc' },
      select: { id: true },
    });
    if (!candidata) return null;
    await this.procesarVencimiento(candidata.id);
    const vigente = await this.prisma.intentoTriviaRush.findFirst({
      where: {
        id: candidata.id,
        usuarioId,
        estado: EstadoIntentoTriviaRush.ACTIVO,
      },
      select: { id: true },
    });
    return vigente ? this.obtener(usuarioId, vigente.id) : null;
  }

  async obtener(usuarioId: string, intentoId: string) {
    await this.procesarVencimiento(intentoId);
    const intento = await this.cargarIntento(intentoId);
    this.validarPropietario(intento, usuarioId);
    return this.presentar(intento);
  }

  async obtenerFantasma(usuarioId: string, entrada: CrearTriviaRushEntrada) {
    await this.validarEstudiante(usuarioId);
    if (!esDuracionTriviaRushValida(entrada.duracionSegundos)) {
      throw new BadRequestException(
        'La duracion del duelo fantasma no es valida.',
      );
    }
    const areas = this.normalizarAreas(entrada.areas);
    if (areas.length === 0 || areas.length > 5) {
      throw new BadRequestException('Selecciona entre una y cinco areas.');
    }

    const intento = await this.prisma.intentoTriviaRush.findFirst({
      where: {
        usuarioId,
        estado: {
          in: [
            EstadoIntentoTriviaRush.FINALIZADO,
            EstadoIntentoTriviaRush.EXPIRADO,
          ],
        },
        areas: { equals: areas },
        duracionBaseSegundos: entrada.duracionSegundos,
        versionReglas: VERSION_REGLAS_TRIVIA_RUSH,
        asistido: false,
      },
      orderBy: [
        { puntaje: 'desc' },
        { respuestasCorrectas: 'desc' },
        { mejorCombo: 'desc' },
        { finalizadoEn: 'desc' },
      ],
      include: {
        respuestas: {
          where: { esFinal: true },
          orderBy: [{ respondidaEn: 'asc' }, { numeroIntento: 'asc' }],
          select: { puntosOtorgados: true, respondidaEn: true },
        },
      },
    });
    if (!intento || !intento.finalizadoEn) return { fantasma: null };

    let puntajeAcumulado = 0;
    const checkpoints = new Map<number, number>();
    for (const respuesta of intento.respuestas) {
      puntajeAcumulado += respuesta.puntosOtorgados;
      const transcurridos = Math.max(
        0,
        Math.min(
          intento.duracionBaseSegundos,
          Math.floor(
            (respuesta.respondidaEn.getTime() - intento.iniciadoEn.getTime()) /
              1000,
          ),
        ),
      );
      checkpoints.set(transcurridos, puntajeAcumulado);
    }
    const finalTranscurrido = Math.max(
      0,
      Math.min(
        intento.duracionBaseSegundos,
        Math.floor(
          (intento.finalizadoEn.getTime() - intento.iniciadoEn.getTime()) /
            1000,
        ),
      ),
    );
    checkpoints.set(finalTranscurrido, intento.puntaje);

    return {
      fantasma: {
        intentoId: intento.id,
        versionReglas: intento.versionReglas,
        areas: intento.areas,
        duracionSegundos: intento.duracionBaseSegundos,
        puntaje: intento.puntaje,
        mejorCombo: intento.mejorCombo,
        respuestasCorrectas: intento.respuestasCorrectas,
        completadoEn: intento.finalizadoEn,
        checkpoints: [...checkpoints.entries()]
          .sort(([izquierda], [derecha]) => izquierda - derecha)
          .map(([segundosTranscurridos, puntaje]) => ({
            segundosTranscurridos,
            puntaje,
          })),
      },
    };
  }

  async responder(
    usuarioId: string,
    intentoId: string,
    entrada: ResponderTriviaRushEntrada,
  ) {
    intentoId = intentoId.toLowerCase();
    entrada = {
      ...entrada,
      idempotencyKey: entrada.idempotencyKey.toLowerCase(),
    };
    const repetida = await this.prisma.triviaRushRespuesta.findUnique({
      where: { claveIdempotencia: entrada.idempotencyKey },
      include: { intento: { select: { usuarioId: true } } },
    });
    if (repetida) {
      this.validarRespuestaRepetida(repetida, usuarioId, intentoId, entrada);
      return this.obtenerConEvaluacion(usuarioId, intentoId, repetida.id);
    }

    await this.procesarVencimiento(intentoId);
    const operacion = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(
        tx,
        `trivia-rush:respuesta:${entrada.idempotencyKey}`,
      );
      await this.bloquearIntento(tx, intentoId, usuarioId);
      const repetidaTx = await tx.triviaRushRespuesta.findUnique({
        where: { claveIdempotencia: entrada.idempotencyKey },
        include: { intento: { select: { usuarioId: true } } },
      });
      if (repetidaTx) {
        this.validarRespuestaRepetida(
          repetidaTx,
          usuarioId,
          intentoId,
          entrada,
        );
        return { respuestaId: repetidaTx.id, vencido: false };
      }
      const intento = await tx.intentoTriviaRush.findUnique({
        where: { id: intentoId },
      });
      if (!intento) throw new NotFoundException('Intento no encontrado.');
      this.validarPropietario(intento, usuarioId);
      this.validarActivo(intento);

      const ahora =
        intento.presenciaVersion === 1
          ? await requireTriviaPresence(tx, intentoId)
          : new Date();
      if (intentoTriviaRushVencido(intento.venceEn, ahora)) {
        await this.marcarExpirado(tx, intento.id, ahora);
        return { respuestaId: null, vencido: true };
      }
      if (entrada.preguntaId !== intento.preguntaActualId) {
        throw new BadRequestException(
          'La respuesta no pertenece a la pregunta actual.',
        );
      }

      const frozen = readTriviaSnapshot(intento);
      const pregunta = frozen
        ? frozen.questions.find((q) => q.preguntaId === entrada.preguntaId)
            ?.pregunta
        : await tx.pregunta.findUnique({
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
          'La respuesta no pertenece a la pregunta actual.',
        );
      }

      const enviosPrevios = await tx.triviaRushRespuesta.count({
        where: { intentoId, preguntaId: entrada.preguntaId },
      });
      if (enviosPrevios >= 2) {
        throw new BadRequestException('Esta pregunta ya fue respondida.');
      }
      const resolucion = resolverRespuestaTriviaRush(
        this.marcador(intento),
        seleccionada.esCorrecta,
        {
          escudoComboActivo: intento.escudoComboActivo,
          segundaOportunidadActiva: intento.segundaOportunidadActiva,
        },
      );
      const creada = await tx.triviaRushRespuesta.create({
        data: {
          intentoId,
          preguntaId: pregunta.id,
          respuestaSeleccionadaId: seleccionada.id,
          numeroIntento: enviosPrevios + 1,
          esCorrecta: seleccionada.esCorrecta,
          esFinal: resolucion.esFinal,
          puntosOtorgados: resolucion.puntosOtorgados,
          comboResultante: resolucion.comboActual,
          tiempoRespuestaMs: milisegundosRespuestaTriviaRush(
            intento.preguntaIniciaEn ?? intento.iniciadoEn,
            ahora,
          ),
          claveIdempotencia: entrada.idempotencyKey,
          respondidaEn: ahora,
        },
      });

      if (!resolucion.esFinal) {
        await tx.intentoTriviaRush.update({
          where: { id: intentoId },
          data: { segundaOportunidadActiva: false },
        });
        return { respuestaId: creada.id, vencido: false };
      }

      await tx.historialRespuesta.create({
        data: {
          sesionId: intentoId,
          usuarioId,
          preguntaId: pregunta.id,
          respuestaSeleccionadaId: seleccionada.id,
          respuestaCorrectaId: correcta.id,
          area: pregunta.subtema.tema.area,
          origen: OrigenRespuesta.TRIVIA_RUSH,
          esCorrecta: seleccionada.esCorrecta,
          tiempoRespuestaSegundos: Math.max(
            0,
            Math.round(creada.tiempoRespuestaMs / 1000),
          ),
        },
      });
      await this.avanzarDespuesDeRespuesta(tx, intento, resolucion, ahora);
      return { respuestaId: creada.id, vencido: false };
    });

    if (operacion.vencido || !operacion.respuestaId) {
      throw new BadRequestException('Se agoto el tiempo de Trivia Rush.');
    }
    return this.obtenerConEvaluacion(
      usuarioId,
      intentoId,
      operacion.respuestaId,
    );
  }

  async activarPotenciador(
    usuarioId: string,
    intentoId: string,
    entrada: ActivarPotenciadorEntrada,
  ) {
    intentoId = intentoId.toLowerCase();
    entrada = {
      ...entrada,
      idempotencyKey: entrada.idempotencyKey.toLowerCase(),
      concesionId: entrada.concesionId.toLowerCase(),
    };
    const repetido = await this.prisma.triviaRushPotenciador.findUnique({
      where: { claveIdempotencia: entrada.idempotencyKey },
      include: { intento: { select: { usuarioId: true } } },
    });
    if (repetido) {
      this.validarPotenciadorRepetido(repetido, usuarioId, intentoId, entrada);
      return this.obtenerConPotenciador(usuarioId, intentoId, repetido.id);
    }

    await this.procesarVencimiento(intentoId);
    const operacion = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(
        tx,
        `trivia-rush:potenciador:${entrada.idempotencyKey}`,
      );
      await this.bloquearIntento(tx, intentoId, usuarioId);
      const repetidoTx = await tx.triviaRushPotenciador.findUnique({
        where: { claveIdempotencia: entrada.idempotencyKey },
        include: { intento: { select: { usuarioId: true } } },
      });
      if (repetidoTx) {
        this.validarPotenciadorRepetido(
          repetidoTx,
          usuarioId,
          intentoId,
          entrada,
        );
        return { potenciadorId: repetidoTx.id, vencido: false };
      }
      await this.bloquear(tx, `recompensa:${entrada.concesionId}`);
      const intento = await tx.intentoTriviaRush.findUnique({
        where: { id: intentoId },
      });
      if (!intento) throw new NotFoundException('Intento no encontrado.');
      this.validarPropietario(intento, usuarioId);
      this.validarActivo(intento);
      const ahora =
        intento.presenciaVersion === 1
          ? await requireTriviaPresence(tx, intentoId)
          : new Date();
      if (intentoTriviaRushVencido(intento.venceEn, ahora)) {
        await this.marcarExpirado(tx, intento.id, ahora);
        return { potenciadorId: null, vencido: true };
      }
      if (entrada.preguntaId !== intento.preguntaActualId) {
        throw new BadRequestException(
          'El potenciador no pertenece a la pregunta actual.',
        );
      }

      const concesion = await tx.concesionRecompensaJuego.findUnique({
        where: { id: entrada.concesionId },
      });
      if (!concesion || concesion.usuarioId !== usuarioId) {
        throw new ForbiddenException(
          'La concesion de recompensa no pertenece a tu cuenta.',
        );
      }
      if (
        concesion.estado !== EstadoConcesionRecompensa.DISPONIBLE ||
        concesion.expiraEn <= ahora
      ) {
        throw new BadRequestException(
          'La concesion ya fue utilizada o esta vencida.',
        );
      }

      if (intento.modalidad === 'GHOST_DUEL')
        throw new BadRequestException(
          'Duelo fantasma no admite potenciadores.',
        );
      await this.validarActivacion(tx, intento, entrada);
      const opcionesEliminadas =
        entrada.potenciador === TipoPotenciadorTriviaRush.CINCUENTA_CINCUENTA
          ? await this.opcionesIncorrectasParaEliminar(
              tx,
              intentoId,
              entrada.preguntaId,
            )
          : [];
      const tomada = await tx.concesionRecompensaJuego.updateMany({
        where: {
          id: entrada.concesionId,
          usuarioId,
          estado: EstadoConcesionRecompensa.DISPONIBLE,
          expiraEn: { gt: ahora },
        },
        data: {
          estado: EstadoConcesionRecompensa.CONSUMIDA,
          consumidaEn: ahora,
        },
      });
      if (tomada.count !== 1) {
        throw new ConflictException('La concesion acaba de ser consumida.');
      }
      const creado = await tx.triviaRushPotenciador.create({
        data: {
          intentoId,
          preguntaId: entrada.preguntaId,
          tipo: entrada.potenciador,
          concesionId: entrada.concesionId,
          claveIdempotencia: entrada.idempotencyKey,
          opcionesEliminadas,
          activadoEn: ahora,
        },
      });
      await this.aplicarPotenciador(tx, intento, entrada.potenciador, ahora);
      return { potenciadorId: creado.id, vencido: false };
    });

    if (operacion.vencido || !operacion.potenciadorId) {
      throw new BadRequestException('Se agoto el tiempo de Trivia Rush.');
    }
    return this.obtenerConPotenciador(
      usuarioId,
      intentoId,
      operacion.potenciadorId,
    );
  }

  async finalizar(usuarioId: string, intentoId: string) {
    await this.procesarVencimiento(intentoId);
    const intento = await this.prisma.intentoTriviaRush.findUnique({
      where: { id: intentoId },
    });
    if (!intento) throw new NotFoundException('Intento no encontrado.');
    this.validarPropietario(intento, usuarioId);
    if (intento.estado === EstadoIntentoTriviaRush.ACTIVO) {
      throw new BadRequestException(
        'El servidor finalizara la ronda cuando se agote el tiempo o las preguntas.',
      );
    }
    return this.obtener(usuarioId, intentoId);
  }

  async abandonar(usuarioId: string, intentoId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearIntento(tx, intentoId, usuarioId);
      const intento = await tx.intentoTriviaRush.findUniqueOrThrow({
        where: { id: intentoId },
      });
      if (intento.estado !== EstadoIntentoTriviaRush.ACTIVO) return;
      const ahora = new Date();
      if (
        intento.evidenciaVersion === 1 &&
        intentoTriviaRushVencido(intento.venceEn, ahora)
      ) {
        await this.marcarExpirado(tx, intentoId, ahora);
        return;
      }
      await tx.intentoTriviaRush.update({
        where: { id: intentoId },
        data: {
          estado: EstadoIntentoTriviaRush.ABANDONADO,
          finalizadoEn: ahora,
          preguntaActualId: null,
          preguntaIniciaEn: null,
          escudoComboActivo: false,
          segundaOportunidadActiva: false,
        },
      });
    });
    return this.obtener(usuarioId, intentoId);
  }

  private async avanzarDespuesDeRespuesta(
    tx: ClienteTransaccion,
    intento: IntentoTriviaRushBase,
    resolucion: ReturnType<typeof resolverRespuestaTriviaRush>,
    ahora: Date,
  ) {
    const siguienteIndice = intento.indiceActual + 1;
    const siguiente = await tx.triviaRushPregunta.findUnique({
      where: {
        intentoId_orden: { intentoId: intento.id, orden: siguienteIndice },
      },
    });
    await tx.intentoTriviaRush.update({
      where: { id: intento.id },
      data: {
        puntaje: resolucion.puntaje,
        comboActual: resolucion.comboActual,
        mejorCombo: resolucion.mejorCombo,
        respuestasCorrectas: resolucion.respuestasCorrectas,
        respuestasIncorrectas: resolucion.respuestasIncorrectas,
        preguntasSaltadas: resolucion.preguntasSaltadas,
        indiceActual: siguienteIndice,
        escudoComboActivo: resolucion.consumioEscudo
          ? false
          : intento.escudoComboActivo,
        segundaOportunidadActiva: false,
        ...(siguiente
          ? {
              preguntaActualId: siguiente.preguntaId,
              preguntaIniciaEn: ahora,
            }
          : {
              estado: EstadoIntentoTriviaRush.FINALIZADO,
              finalizadoEn: ahora,
              preguntaActualId: null,
              preguntaIniciaEn: null,
              escudoComboActivo: false,
            }),
      },
    });
  }

  private async aplicarPotenciador(
    tx: ClienteTransaccion,
    intento: IntentoTriviaRushBase,
    tipo: TipoPotenciadorTriviaRush,
    ahora: Date,
  ) {
    if (tipo === TipoPotenciadorTriviaRush.SALTAR) {
      const marcador = registrarSaltoTriviaRush(this.marcador(intento));
      const enviosPrevios = await tx.triviaRushRespuesta.count({
        where: { intentoId: intento.id, preguntaId: intento.preguntaActualId },
      });
      await tx.triviaRushRespuesta.create({
        data: {
          intentoId: intento.id,
          preguntaId: intento.preguntaActualId,
          respuestaSeleccionadaId: null,
          numeroIntento: enviosPrevios + 1,
          esCorrecta: false,
          esFinal: true,
          puntosOtorgados: 0,
          comboResultante: marcador.comboActual,
          tiempoRespuestaMs: milisegundosRespuestaTriviaRush(
            intento.preguntaIniciaEn ?? intento.iniciadoEn,
            ahora,
          ),
          claveIdempotencia: randomUUID(),
          respondidaEn: ahora,
        },
      });
      const siguienteIndice = intento.indiceActual + 1;
      const siguiente = await tx.triviaRushPregunta.findUnique({
        where: {
          intentoId_orden: {
            intentoId: intento.id,
            orden: siguienteIndice,
          },
        },
      });
      await tx.intentoTriviaRush.update({
        where: { id: intento.id },
        data: {
          asistido: true,
          preguntasSaltadas: marcador.preguntasSaltadas,
          indiceActual: siguienteIndice,
          escudoComboActivo: intento.escudoComboActivo,
          segundaOportunidadActiva: false,
          ...(siguiente
            ? {
                preguntaActualId: siguiente.preguntaId,
                preguntaIniciaEn: ahora,
              }
            : {
                estado: EstadoIntentoTriviaRush.FINALIZADO,
                finalizadoEn: ahora,
                preguntaActualId: null,
                preguntaIniciaEn: null,
                escudoComboActivo: false,
              }),
        },
      });
      return;
    }

    await tx.intentoTriviaRush.update({
      where: { id: intento.id },
      data: {
        asistido: true,
        ...(tipo === TipoPotenciadorTriviaRush.TIEMPO_EXTRA
          ? {
              tiempoExtraSegundos: { increment: SEGUNDOS_TIEMPO_EXTRA },
              venceEn: new Date(
                intento.venceEn.getTime() + SEGUNDOS_TIEMPO_EXTRA * 1000,
              ),
            }
          : {}),
        ...(tipo === TipoPotenciadorTriviaRush.ESCUDO_COMBO
          ? { escudoComboActivo: true }
          : {}),
        ...(tipo === TipoPotenciadorTriviaRush.SEGUNDA_OPORTUNIDAD
          ? { segundaOportunidadActiva: true }
          : {}),
      },
    });
  }

  private async validarActivacion(
    tx: ClienteTransaccion,
    intento: IntentoTriviaRushBase,
    entrada: ActivarPotenciadorEntrada,
  ) {
    if (
      entrada.potenciador === TipoPotenciadorTriviaRush.ESCUDO_COMBO &&
      intento.escudoComboActivo
    ) {
      throw new BadRequestException('Ya tienes un escudo de combo activo.');
    }
    if (
      entrada.potenciador === TipoPotenciadorTriviaRush.SEGUNDA_OPORTUNIDAD &&
      intento.segundaOportunidadActiva
    ) {
      throw new BadRequestException(
        'Ya tienes una segunda oportunidad activa.',
      );
    }
    if (entrada.potenciador === TipoPotenciadorTriviaRush.CINCUENTA_CINCUENTA) {
      const usada = await tx.triviaRushPotenciador.count({
        where: {
          intentoId: intento.id,
          preguntaId: entrada.preguntaId,
          tipo: entrada.potenciador,
        },
      });
      if (usada > 0) {
        throw new BadRequestException(
          'Ya usaste descartar dos en esta pregunta.',
        );
      }
    }
  }

  private async opcionesIncorrectasParaEliminar(
    tx: ClienteTransaccion,
    intentoId: string,
    preguntaId: string,
  ): Promise<string[]> {
    const original = await tx.intentoTriviaRush.findUniqueOrThrow({
      where: { id: intentoId },
    });
    const frozen = readTriviaSnapshot(original)?.questions.find(
      (q) => q.preguntaId === preguntaId,
    );
    if (frozen)
      return frozen.opcionesOrden
        .filter((id) =>
          frozen.pregunta.respuestas.some((r) => r.id === id && !r.esCorrecta),
        )
        .slice(0, 2);
    const [asignada, respuestas] = await Promise.all([
      tx.triviaRushPregunta.findUnique({
        where: { intentoId_preguntaId: { intentoId, preguntaId } },
      }),
      tx.respuesta.findMany({ where: { preguntaId } }),
    ]);
    if (!asignada) {
      throw new BadRequestException('La pregunta no pertenece al intento.');
    }
    const mapa = new Map(
      respuestas.map((respuesta) => [respuesta.id, respuesta] as const),
    );
    return this.leerIds(asignada.opcionesOrden)
      .map((id) => mapa.get(id))
      .filter((respuesta) => respuesta && !respuesta.esCorrecta)
      .slice(0, 2)
      .map((respuesta) => respuesta.id);
  }

  private async procesarVencimiento(intentoId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearIntento(tx, intentoId);
      const intento = await tx.intentoTriviaRush.findUnique({
        where: { id: intentoId },
      });
      if (
        intento?.estado === EstadoIntentoTriviaRush.ACTIVO &&
        intentoTriviaRushVencido(intento.venceEn, new Date())
      ) {
        await this.marcarExpirado(tx, intento.id, new Date());
      }
    });
  }

  private async marcarExpirado(
    tx: ClienteTransaccion,
    intentoId: string,
    ahora: Date,
  ) {
    const original = await tx.intentoTriviaRush.findUniqueOrThrow({
      where: { id: intentoId },
    });
    return tx.intentoTriviaRush.update({
      where: { id: intentoId },
      data: {
        estado: EstadoIntentoTriviaRush.EXPIRADO,
        finalizadoEn:
          original.evidenciaVersion === 1 ? original.venceEn : ahora,
        preguntaActualId: null,
        preguntaIniciaEn: null,
        escudoComboActivo: false,
        segundaOportunidadActiva: false,
      },
    });
  }

  private async cargarIntento(intentoId: string) {
    const intento = await this.prisma.intentoTriviaRush.findUnique({
      where: { id: intentoId },
      include: {
        preguntas: {
          orderBy: { orden: 'asc' },
          include: {
            pregunta: {
              include: {
                respuestas: true,
                subtema: { include: { tema: true } },
                caso: { select: { contexto: true, imagenUrl: true } },
              },
            },
          },
        },
        respuestas: {
          orderBy: [{ respondidaEn: 'asc' }, { numeroIntento: 'asc' }],
        },
        potenciadores: { orderBy: { activadoEn: 'asc' } },
      },
    });
    if (!intento) throw new NotFoundException('Intento no encontrado.');
    const snapshot = readTriviaSnapshot(intento);
    if (snapshot)
      intento.preguntas = snapshot.questions.map((q) => ({
        ...q,
        intentoId,
      })) as unknown as typeof intento.preguntas;
    return intento;
  }

  private presentar(intento: IntentoTriviaRushCompleto) {
    const activa = intento.estado === EstadoIntentoTriviaRush.ACTIVO;
    const asignada = activa ? intento.preguntas[intento.indiceActual] : null;
    const servidorAhora = new Date();
    const opcionesEliminadas = asignada
      ? intento.potenciadores
          .filter(
            (potenciador) =>
              potenciador.preguntaId === asignada.preguntaId &&
              potenciador.tipo ===
                TipoPotenciadorTriviaRush.CINCUENTA_CINCUENTA,
          )
          .flatMap((potenciador) =>
            this.leerIds(potenciador.opcionesEliminadas ?? undefined),
          )
      : [];
    return {
      servidorAhora,
      intento: {
        id: intento.id,
        ...(intento.evidenciaVersion === 1
          ? {
              modalidad: intento.modalidad,
              competitive: false,
              fantasmaInicial: readTriviaSnapshot(intento)!.ghost,
            }
          : {}),
        estado: intento.estado,
        versionReglas: intento.versionReglas,
        areas: intento.areas,
        duracionBaseSegundos: intento.duracionBaseSegundos,
        tiempoExtraSegundos: intento.tiempoExtraSegundos,
        iniciadoEn: intento.iniciadoEn,
        venceEn: intento.venceEn,
        finalizadoEn: intento.finalizadoEn,
        tiempoRestanteMs: activa
          ? Math.max(0, intento.venceEn.getTime() - servidorAhora.getTime())
          : 0,
        asistido: intento.asistido,
        marcador: this.marcador(intento),
        progreso: {
          indiceActual: intento.indiceActual,
          respondidas:
            intento.respuestasCorrectas +
            intento.respuestasIncorrectas +
            intento.preguntasSaltadas,
          totalPreguntas: intento.preguntas.length,
        },
        potenciadoresActivos: {
          escudoCombo: intento.escudoComboActivo,
          segundaOportunidad: intento.segundaOportunidadActiva,
          opcionesEliminadas: [...new Set(opcionesEliminadas)],
        },
        pregunta: asignada ? this.presentarPreguntaPublica(asignada) : null,
        resultado: activa ? null : this.presentarResultado(intento),
      },
    };
  }

  private presentarPreguntaPublica(asignada: PreguntaTriviaRushCompleta) {
    const pregunta = asignada.pregunta;
    const mapa = new Map(
      pregunta.respuestas.map(
        (respuesta) => [respuesta.id, respuesta] as const,
      ),
    );
    return {
      id: pregunta.id,
      enunciado: pregunta.enunciado,
      imagenUrl: pregunta.imagenUrl ?? pregunta.caso?.imagenUrl ?? null,
      contexto: pregunta.caso?.contexto ?? null,
      dificultad: pregunta.dificultad,
      area: pregunta.subtema.tema.area,
      tema: pregunta.subtema.tema.nombre,
      subtema: pregunta.subtema.nombre,
      subtemaId: pregunta.subtemaId,
      opciones: this.leerIds(asignada.opcionesOrden)
        .map((id) => mapa.get(id))
        .filter(Boolean)
        .map((respuesta) => ({ id: respuesta.id, texto: respuesta.texto })),
    };
  }

  private presentarResultado(intento: IntentoTriviaRushCompleto) {
    const finales = new Map(
      intento.respuestas
        .filter((respuesta) => respuesta.esFinal)
        .map((respuesta) => [respuesta.preguntaId, respuesta] as const),
    );
    const revision: RevisionTriviaRush[] = intento.preguntas.flatMap(
      (asignada): RevisionTriviaRush[] => {
        const pregunta = asignada.pregunta;
        const respuesta = finales.get(pregunta.id);
        if (!respuesta) return [];
        const correcta = pregunta.respuestas.find((item) => item.esCorrecta);
        const saltada = !respuesta.respuestaSeleccionadaId;
        return [
          {
            preguntaId: pregunta.id,
            respuestaSeleccionadaId: respuesta?.respuestaSeleccionadaId ?? null,
            respuestaCorrectaId: saltada ? null : (correcta?.id ?? null),
            esCorrecta: respuesta?.esCorrecta ?? false,
            saltada,
            explicacion: saltada
              ? null
              : (pregunta.explicacion ?? correcta?.explicacion ?? null),
            area: pregunta.subtema.tema.area,
            tema: pregunta.subtema.tema.nombre,
            subtema: pregunta.subtema.nombre,
            subtemaId: pregunta.subtemaId,
          },
        ];
      },
    );
    const diagnostico = new Map<string, DiagnosticoTriviaRush>();
    for (const item of revision.filter(
      (elemento) => !elemento.esCorrecta && !elemento.saltada,
    )) {
      const actual = diagnostico.get(item.subtemaId);
      diagnostico.set(item.subtemaId, {
        area: item.area,
        tema: item.tema,
        subtema: item.subtema,
        subtemaId: item.subtemaId,
        errores: (actual?.errores ?? 0) + 1,
      });
    }
    return {
      marcador: this.marcador(intento),
      revision,
      diagnostico: [...diagnostico.values()].sort(
        (a, b) => b.errores - a.errores,
      ),
    };
  }

  private async obtenerConEvaluacion(
    usuarioId: string,
    intentoId: string,
    respuestaId: string,
  ) {
    const [estado, respuesta] = await Promise.all([
      this.obtener(usuarioId, intentoId),
      this.prisma.triviaRushRespuesta.findUnique({
        where: { id: respuestaId },
        include: {
          pregunta: { include: { respuestas: true } },
        },
      }),
    ]);
    if (!respuesta) throw new NotFoundException('Respuesta no encontrada.');
    const original = await this.prisma.intentoTriviaRush.findUniqueOrThrow({
      where: { id: intentoId },
    });
    const snapshot = readTriviaSnapshot(original);
    const pregunta = snapshot
      ? snapshot.questions.find((q) => q.preguntaId === respuesta.preguntaId)!
          .pregunta
      : respuesta.pregunta;
    const correcta = pregunta.respuestas.find((item) => item.esCorrecta);
    return {
      ...estado,
      evaluacion: {
        preguntaId: respuesta.preguntaId,
        esCorrecta: respuesta.esCorrecta,
        esFinal: respuesta.esFinal,
        puedeReintentar: !respuesta.esFinal,
        puntosOtorgados: respuesta.puntosOtorgados,
        comboResultante: respuesta.comboResultante,
        tiempoRespuestaMs: respuesta.tiempoRespuestaMs,
        respuestaCorrectaId: respuesta.esFinal ? (correcta?.id ?? null) : null,
        explicacion: respuesta.esFinal
          ? (pregunta.explicacion ?? correcta?.explicacion ?? null)
          : null,
      },
    };
  }

  private async obtenerConPotenciador(
    usuarioId: string,
    intentoId: string,
    potenciadorId: string,
  ) {
    const [estado, potenciador] = await Promise.all([
      this.obtener(usuarioId, intentoId),
      this.prisma.triviaRushPotenciador.findUnique({
        where: { id: potenciadorId },
      }),
    ]);
    if (!potenciador) {
      throw new NotFoundException('Activacion de potenciador no encontrada.');
    }
    return {
      ...estado,
      activacion: {
        potenciador: potenciador.tipo,
        preguntaId: potenciador.preguntaId,
        opcionesEliminadas: this.leerIds(
          potenciador.opcionesEliminadas ?? undefined,
        ),
      },
    };
  }

  private validarRespuestaRepetida(
    respuesta: RespuestaRepetida,
    usuarioId: string,
    intentoId: string,
    entrada: ResponderTriviaRushEntrada,
  ) {
    if (
      respuesta.intento.usuarioId !== usuarioId ||
      respuesta.intentoId !== intentoId ||
      respuesta.preguntaId !== entrada.preguntaId ||
      respuesta.respuestaSeleccionadaId !== entrada.respuestaId
    ) {
      throw new ForbiddenException(
        'La clave de idempotencia ya fue utilizada por otra operacion.',
      );
    }
  }

  private validarPotenciadorRepetido(
    potenciador: PotenciadorRepetido,
    usuarioId: string,
    intentoId: string,
    entrada: ActivarPotenciadorEntrada,
  ) {
    if (
      potenciador.intento.usuarioId !== usuarioId ||
      potenciador.intentoId !== intentoId ||
      potenciador.preguntaId !== entrada.preguntaId ||
      potenciador.tipo !== entrada.potenciador ||
      potenciador.concesionId !== entrada.concesionId
    ) {
      throw new ForbiddenException(
        'La clave de idempotencia ya fue utilizada por otra operacion.',
      );
    }
  }

  private async seleccionarPreguntas(
    areas: AreaIcfes[],
    cliente: PrismaService | ClienteTransaccion = this.prisma,
  ) {
    const candidatas = await cliente.pregunta.findMany({
      where: preguntaPublicadaWhere({
        subtema: { tema: { area: { in: areas } } },
        respuestas: { some: { esCorrecta: true } },
      }),
      include: snapshotQuestionInclude,
      take: 300,
    });
    const validas = candidatas.filter(
      (pregunta) =>
        pregunta.respuestas.length === 4 &&
        pregunta.respuestas.filter((respuesta) => respuesta.esCorrecta)
          .length === 1,
    );
    if (validas.length < MINIMO_PREGUNTAS) {
      throw new BadRequestException(
        `Se necesitan al menos ${MINIMO_PREGUNTAS} preguntas validas con cuatro opciones para jugar.`,
      );
    }

    const elegidas: typeof validas = [];
    for (const dificultad of [
      Dificultad.BASICO,
      Dificultad.MEDIO,
      Dificultad.AVANZADO,
    ]) {
      elegidas.push(
        ...mezclar(
          validas.filter((pregunta) => pregunta.dificultad === dificultad),
        ).slice(0, PREGUNTAS_POR_DIFICULTAD),
      );
    }
    const ids = new Set(elegidas.map((pregunta) => pregunta.id));
    if (elegidas.length < Math.min(PREGUNTAS_OBJETIVO, validas.length)) {
      elegidas.push(
        ...mezclar(validas.filter((pregunta) => !ids.has(pregunta.id))).slice(
          0,
          PREGUNTAS_OBJETIVO - elegidas.length,
        ),
      );
    }
    return elegidas.slice(0, PREGUNTAS_OBJETIVO);
  }

  private marcador(intento: IntentoTriviaRushBase) {
    return {
      puntaje: intento.puntaje,
      comboActual: intento.comboActual,
      mejorCombo: intento.mejorCombo,
      respuestasCorrectas: intento.respuestasCorrectas,
      respuestasIncorrectas: intento.respuestasIncorrectas,
      preguntasSaltadas: intento.preguntasSaltadas,
    };
  }

  private normalizarAreas(areas: AreaIcfes[]): AreaIcfes[] {
    return [...new Set(areas)].sort();
  }

  private mismasAreas(primera: AreaIcfes[], segunda: AreaIcfes[]): boolean {
    const a = this.normalizarAreas(primera);
    const b = this.normalizarAreas(segunda);
    return (
      a.length === b.length && a.every((area, indice) => area === b[indice])
    );
  }

  private validarActivo(intento: { estado: EstadoIntentoTriviaRush }) {
    if (intento.estado !== EstadoIntentoTriviaRush.ACTIVO) {
      throw new BadRequestException('El intento de Trivia Rush ya finalizo.');
    }
  }

  private validarPropietario(
    intento: { usuarioId: string },
    usuarioId: string,
  ) {
    if (intento.usuarioId !== usuarioId) {
      throw new ForbiddenException('Este intento pertenece a otra cuenta.');
    }
  }

  private async validarEstudiante(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (usuario.rol !== RolUsuario.ESTUDIANTE) {
      throw new ForbiddenException(
        'Trivia Rush es para cuentas de estudiante.',
      );
    }
  }

  private leerIds(valor: Prisma.JsonValue | undefined): string[] {
    return Array.isArray(valor)
      ? valor.filter(
          (elemento): elemento is string => typeof elemento === 'string',
        )
      : [];
  }

  private async bloquearUsuario(tx: ClienteTransaccion, usuarioId: string) {
    await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuarioId}::uuid FOR UPDATE`;
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true },
    });
    if (usuario?.rol !== RolUsuario.ESTUDIANTE)
      throw new ForbiddenException('Trivia Rush es para estudiantes.');
  }

  private async bloquearIntento(
    tx: ClienteTransaccion,
    intentoId: string,
    usuarioId?: string,
  ) {
    const owner = await tx.intentoTriviaRush.findUnique({
      where: { id: intentoId },
      select: { usuarioId: true, presenciaVersion: true },
    });
    if (!owner) throw new NotFoundException('Intento no encontrado.');
    if (usuarioId && owner.usuarioId !== usuarioId)
      throw new ForbiddenException('El intento no pertenece a tu cuenta.');
    await this.bloquearUsuario(tx, owner.usuarioId);
    await tx.$queryRaw`SELECT id FROM "IntentoTriviaRush" WHERE id = ${intentoId}::uuid FOR UPDATE`;
    if (owner.presenciaVersion === 1)
      await resolveTriviaPresence(tx, intentoId);
  }

  private async fijarFantasma(
    tx: ClienteTransaccion,
    usuarioId: string,
    current: TriviaSnapshot,
  ): Promise<TriviaSnapshot['ghost']> {
    // Historical/mutable records cannot establish an authoritative reference.
    const prior = await tx.intentoTriviaRush.findFirst({
      where: {
        usuarioId,
        evidenciaVersion: 1,
        asistido: false,
        estado: {
          in: [
            EstadoIntentoTriviaRush.FINALIZADO,
            EstadoIntentoTriviaRush.EXPIRADO,
          ],
        },
        areas: { equals: current.config.areas },
        duracionBaseSegundos: current.config.duracionSegundos,
        versionReglas: current.config.versionReglas,
        snapshotInicial: { path: ['q'], equals: current.q },
      },
      orderBy: [
        { puntaje: 'desc' },
        { respuestasCorrectas: 'desc' },
        { mejorCombo: 'desc' },
        { finalizadoEn: 'desc' },
        { id: 'asc' },
      ],
      include: {
        respuestas: {
          where: { esFinal: true },
          orderBy: [
            { respondidaEn: 'asc' },
            { numeroIntento: 'asc' },
            { id: 'asc' },
          ],
        },
      },
    });
    if (!prior) return null;
    const original = readTriviaSnapshot(prior)!;
    const order = new Map(
      original.questions.map((q) => [q.preguntaId, q.orden]),
    );
    prior.respuestas.sort(
      (a, b) =>
        order.get(a.preguntaId)! - order.get(b.preguntaId)! ||
        a.numeroIntento - b.numeroIntento,
    );
    let score = 0;
    return {
      intentoId: prior.id,
      puntaje: prior.puntaje,
      respuestasCorrectas: prior.respuestasCorrectas,
      mejorCombo: prior.mejorCombo,
      finalizadoEn: prior.finalizadoEn!.toISOString(),
      q: original.q,
      config: original.config,
      checkpoints: prior.respuestas.map((r) => ({
        segundosTranscurridos: Math.min(
          prior.duracionBaseSegundos,
          Math.max(
            0,
            Math.floor(
              (r.respondidaEn.getTime() - prior.iniciadoEn.getTime()) / 1000,
            ),
          ),
        ),
        puntaje: (score += r.puntosOtorgados),
      })),
    };
  }

  private bloquear(tx: ClienteTransaccion, clave: string) {
    return tx.$queryRaw(
      Prisma.sql`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${clave}))`,
    );
  }
}
