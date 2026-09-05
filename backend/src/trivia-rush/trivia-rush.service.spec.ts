import { ForbiddenException } from '@nestjs/common';
import {
  AreaIcfes,
  EstadoIntentoTriviaRush,
  RolUsuario,
  TipoPotenciadorTriviaRush,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TriviaRushService } from './trivia-rush.service';

describe('TriviaRushService', () => {
  it('nunca expone esCorrecta ni explicaciones en la pregunta activa', () => {
    const servicio = new TriviaRushService({} as PrismaService);
    const expositor = servicio as unknown as {
      presentarPreguntaPublica(asignada: unknown): unknown;
    };
    const resultado = expositor.presentarPreguntaPublica({
      opcionesOrden: ['respuesta-b', 'respuesta-a'],
      pregunta: {
        id: 'pregunta-1',
        enunciado: 'Pregunta segura',
        explicacion: 'Se revela despues.',
        imagenUrl: null,
        dificultad: 'BASICO',
        subtemaId: 'subtema-1',
        caso: null,
        subtema: {
          nombre: 'Regla de tres',
          tema: { nombre: 'Aritmetica', area: 'MATEMATICAS' },
        },
        respuestas: [
          { id: 'respuesta-a', texto: 'Correcta', esCorrecta: true },
          { id: 'respuesta-b', texto: 'Incorrecta', esCorrecta: false },
        ],
      },
    });
    const serializado = JSON.stringify(resultado);

    expect(serializado).not.toContain('esCorrecta');
    expect(serializado).not.toContain('Se revela despues.');
    expect(resultado).toEqual(
      expect.objectContaining({
        opciones: [
          { id: 'respuesta-b', texto: 'Incorrecta' },
          { id: 'respuesta-a', texto: 'Correcta' },
        ],
      }),
    );
  });

  it('al expirar solo revela la revision de preguntas respondidas', () => {
    const servicio = new TriviaRushService({} as PrismaService);
    const expositor = servicio as unknown as {
      presentarResultado(intento: unknown): { revision: unknown[] };
    };
    const crearAsignada = (id: string) => ({
      pregunta: {
        id,
        explicacion: `Explicacion ${id}`,
        subtemaId: `subtema-${id}`,
        subtema: {
          nombre: 'Subtema',
          tema: { nombre: 'Tema', area: 'MATEMATICAS' },
        },
        respuestas: [
          { id: `correcta-${id}`, esCorrecta: true, explicacion: null },
          { id: `incorrecta-${id}`, esCorrecta: false, explicacion: null },
        ],
      },
    });
    const resultado = expositor.presentarResultado({
      puntaje: 0,
      comboActual: 0,
      mejorCombo: 0,
      respuestasCorrectas: 0,
      respuestasIncorrectas: 1,
      preguntasSaltadas: 0,
      preguntas: [crearAsignada('1'), crearAsignada('2'), crearAsignada('3')],
      respuestas: [
        {
          preguntaId: '1',
          respuestaSeleccionadaId: 'incorrecta-1',
          esCorrecta: false,
          esFinal: true,
        },
        {
          preguntaId: '2',
          respuestaSeleccionadaId: null,
          esCorrecta: false,
          esFinal: true,
        },
      ],
    });

    expect(resultado.revision).toHaveLength(2);
    expect(JSON.stringify(resultado)).not.toContain('Explicacion 2');
    expect(JSON.stringify(resultado)).not.toContain('Explicacion 3');
  });

  it('rechaza reutilizar una clave de respuesta para otra operacion', async () => {
    const prisma = {
      triviaRushRespuesta: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'envio-1',
          intentoId: 'intento-ajeno',
          preguntaId: 'pregunta-1',
          respuestaSeleccionadaId: 'respuesta-1',
          intento: { usuarioId: 'usuario-1' },
        }),
      },
    } as unknown as PrismaService;
    const servicio = new TriviaRushService(prisma);

    await expect(
      servicio.responder('usuario-1', 'intento-1', {
        preguntaId: 'pregunta-1',
        respuestaId: 'respuesta-1',
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza reutilizar la idempotencia de un potenciador o concesion', async () => {
    const prisma = {
      triviaRushPotenciador: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'potenciador-1',
          intentoId: 'intento-1',
          preguntaId: 'pregunta-1',
          tipo: TipoPotenciadorTriviaRush.TIEMPO_EXTRA,
          concesionId: '00000000-0000-4000-8000-000000000010',
          intento: { usuarioId: 'usuario-1' },
        }),
      },
    } as unknown as PrismaService;
    const servicio = new TriviaRushService(prisma);

    await expect(
      servicio.activarPotenciador('usuario-1', 'intento-1', {
        preguntaId: 'pregunta-1',
        potenciador: TipoPotenciadorTriviaRush.ESCUDO_COMBO,
        concesionId: '00000000-0000-4000-8000-000000000010',
        idempotencyKey: '00000000-0000-4000-8000-000000000011',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('distingue estados terminales del intento', () => {
    expect([
      EstadoIntentoTriviaRush.FINALIZADO,
      EstadoIntentoTriviaRush.EXPIRADO,
      EstadoIntentoTriviaRush.ABANDONADO,
    ]).not.toContain(EstadoIntentoTriviaRush.ACTIVO);
  });

  it('reconstruye el mejor fantasma desde una ronda limpia validada', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      versionReglas: 1,
      areas: [AreaIcfes.MATEMATICAS],
      duracionBaseSegundos: 60,
      puntaje: 300,
      mejorCombo: 2,
      respuestasCorrectas: 2,
      iniciadoEn: new Date('2026-08-31T12:00:00.000Z'),
      finalizadoEn: new Date('2026-08-31T12:01:00.000Z'),
      respuestas: [
        {
          puntosOtorgados: 100,
          respondidaEn: new Date('2026-08-31T12:00:05.100Z'),
        },
        {
          puntosOtorgados: 200,
          respondidaEn: new Date('2026-08-31T12:00:05.900Z'),
        },
      ],
    });
    const prisma = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ rol: RolUsuario.ESTUDIANTE }),
      },
      intentoTriviaRush: { findFirst },
    } as unknown as PrismaService;
    const servicio = new TriviaRushService(prisma);

    const resultado = await servicio.obtenerFantasma('usuario-1', {
      areas: [AreaIcfes.MATEMATICAS],
      duracionSegundos: 60,
    });

    expect(resultado.fantasma).toEqual(
      expect.objectContaining({
        intentoId: '00000000-0000-4000-8000-000000000001',
        puntaje: 300,
        checkpoints: [
          { segundosTranscurridos: 5, puntaje: 300 },
          { segundosTranscurridos: 60, puntaje: 300 },
        ],
      }),
    );
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('responde null cuando el estudiante aun no tiene un fantasma limpio', async () => {
    const prisma = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ rol: RolUsuario.ESTUDIANTE }),
      },
      intentoTriviaRush: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const servicio = new TriviaRushService(prisma);

    await expect(
      servicio.obtenerFantasma('usuario-1', {
        areas: [AreaIcfes.LECTURA_CRITICA],
        duracionSegundos: 90,
      }),
    ).resolves.toEqual({ fantasma: null });
  });
});
