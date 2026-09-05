import { ForbiddenException } from '@nestjs/common';
import {
  EstadoBatalla,
  EstadoParticipanteBatalla,
  ModoBatalla,
  EstadoReporteBatalla,
  MotivoReporteBatalla,
  ResultadoParticipanteBatalla,
  RolUsuario,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BatallasService } from './batallas.service';

describe('BatallasService', () => {
  const usuario = { findUnique: jest.fn(), findMany: jest.fn() };
  const batalla = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  };
  const batallaEstadistica = { findUnique: jest.fn() };
  const batallaBloqueo = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  };
  const batallaReporte = { findUnique: jest.fn(), create: jest.fn() };
  const prisma = {
    usuario,
    batalla,
    batallaEstadistica,
    batallaBloqueo,
    batallaReporte,
  } as unknown as PrismaService;
  const service = new BatallasService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue({
      id: 'usuario-1',
      rol: RolUsuario.ESTUDIANTE,
    });
    batalla.updateMany.mockResolvedValue({ count: 0 });
    batallaEstadistica.findUnique.mockResolvedValue(null);
    batalla.findMany.mockResolvedValue([]);
    batallaBloqueo.findMany.mockResolvedValue([]);
    batallaBloqueo.findFirst.mockResolvedValue(null);
    batallaReporte.findUnique.mockResolvedValue(null);
  });

  it('entrega un resumen vacio basado en datos persistidos', async () => {
    await expect(service.listar('usuario-1')).resolves.toEqual({
      resumen: {
        jugadas: 0,
        victorias: 0,
        derrotas: 0,
        empates: 0,
        rachaActual: 0,
        mejorRacha: 0,
        xpBatallas: 0,
      },
      batallas: [],
      privacidad: {
        identidadesProtegidas: true,
        chatHabilitado: false,
        datosRivalPublicados: ['alias', 'progreso'],
      },
    });
  });

  it('impide que profesores y administradores entren a batallas', async () => {
    usuario.findUnique.mockResolvedValue({
      id: 'profesor-1',
      rol: RolUsuario.PROFESOR,
    });

    await expect(service.listar('profesor-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(batalla.findMany).not.toHaveBeenCalled();
  });

  it('no revela respuestas correctas mientras la batalla sigue activa', async () => {
    batalla.findFirst.mockResolvedValue(detalleBatalla(EstadoBatalla.ACTIVA));

    const detalle = await service.obtenerDetalle('usuario-1', 'batalla-1');

    expect(detalle.preguntas[0]).toMatchObject({
      respuestaPropiaId: 'respuesta-b',
    });
    expect(detalle.preguntas[0]).not.toHaveProperty('respuestaCorrectaId');
    expect(detalle.preguntas[0]).not.toHaveProperty('explicacion');
  });

  it('revela correccion y explicacion solamente al finalizar', async () => {
    batalla.findFirst.mockResolvedValue(
      detalleBatalla(EstadoBatalla.FINALIZADA),
    );

    const detalle = await service.obtenerDetalle('usuario-1', 'batalla-1');

    expect(detalle.preguntas[0]).toMatchObject({
      esCorrecta: false,
      respuestaCorrectaId: 'respuesta-a',
      explicacion: 'Porque A es correcta.',
    });
  });

  it('protege la identidad del rival en todo el contrato publico', async () => {
    batalla.findFirst.mockResolvedValue(
      detalleBatalla(EstadoBatalla.FINALIZADA),
    );

    const detalle = await service.obtenerDetalle('usuario-1', 'batalla-1');
    const serializado = JSON.stringify(detalle);

    expect(detalle.rival).toEqual({ alias: 'Rival anonimo' });
    expect(detalle.privacidad).toMatchObject({
      identidadesProtegidas: true,
      chatHabilitado: false,
    });
    expect(serializado).not.toContain('usuario-2');
    expect(serializado).not.toContain('Pavel');
  });

  it('impide aceptar una invitacion cuando existe un bloqueo', async () => {
    batalla.findFirst.mockResolvedValue({
      id: 'batalla-1',
      retadorId: 'usuario-2',
      modo: ModoBatalla.CARRERA_FANTASMA,
    });
    batallaBloqueo.findFirst.mockResolvedValue({ id: 'bloqueo-1' });

    await expect(
      service.unirseInvitacion('usuario-1', 'SABER123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloquea al rival sin devolver su identificador', async () => {
    batalla.findFirst.mockResolvedValue({
      retadorId: 'usuario-1',
      rivalId: 'usuario-2',
    });
    batallaBloqueo.upsert.mockResolvedValue({
      id: 'bloqueo-1',
      fechaCreacion: new Date('2026-08-31T20:00:00Z'),
    });

    const respuesta = await service.bloquearRival('usuario-1', 'batalla-1');

    expect(batallaBloqueo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          bloqueadorId: 'usuario-1',
          bloqueadoId: 'usuario-2',
        },
      }),
    );
    expect(JSON.stringify(respuesta)).not.toContain('usuario-2');
  });

  it('registra un reporte idempotente resuelto desde la batalla', async () => {
    batalla.findFirst.mockResolvedValue({
      retadorId: 'usuario-1',
      rivalId: 'usuario-2',
    });
    batallaReporte.create.mockResolvedValue({
      id: 'reporte-1',
      estado: EstadoReporteBatalla.RECIBIDO,
      fechaCreacion: new Date('2026-08-31T20:05:00Z'),
    });

    const respuesta = await service.reportar('usuario-1', 'batalla-1', {
      motivo: MotivoReporteBatalla.TRAMPA,
      detalle: '  Respuestas imposibles  ',
    });

    expect(batallaReporte.create).toHaveBeenCalledWith({
      data: {
        batallaId: 'batalla-1',
        reportanteId: 'usuario-1',
        reportadoId: 'usuario-2',
        motivo: MotivoReporteBatalla.TRAMPA,
        detalle: 'Respuestas imposibles',
      },
      select: { id: true, estado: true, fechaCreacion: true },
    });
    expect(respuesta).toMatchObject({
      id: 'reporte-1',
      estado: EstadoReporteBatalla.RECIBIDO,
    });
  });

  function detalleBatalla(estado: EstadoBatalla) {
    const usuarioBase = {
      id: 'usuario-1',
      nombre: 'Pavel',
      fotoPerfil: null,
    };
    return {
      id: 'batalla-1',
      modo: ModoBatalla.CARRERA_FANTASMA,
      area: null,
      estado,
      retadorId: 'usuario-1',
      rivalId: 'usuario-2',
      ganadorId: null,
      codigoInvitacion: null,
      expiraEn: new Date('2026-08-26T12:00:00Z'),
      fechaCreacion: new Date('2026-08-25T12:00:00Z'),
      fechaFinalizacion:
        estado === EstadoBatalla.FINALIZADA
          ? new Date('2026-08-25T13:00:00Z')
          : null,
      retador: usuarioBase,
      rival: { id: 'usuario-2', nombre: 'Rival', fotoPerfil: null },
      participantes: [
        {
          usuarioId: 'usuario-1',
          usuario: usuarioBase,
          estado: EstadoParticipanteBatalla.EN_JUEGO,
          resultado: ResultadoParticipanteBatalla.PENDIENTE,
          respuestasCorrectas: 0,
          vidasRestantes: null,
          xpGanado: 0,
          iniciadoEn: new Date('2026-08-25T12:01:00Z'),
          _count: { respuestas: 1 },
        },
        {
          usuarioId: 'usuario-2',
          usuario: { id: 'usuario-2', nombre: 'Rival', fotoPerfil: null },
          estado: EstadoParticipanteBatalla.LISTO,
          resultado: ResultadoParticipanteBatalla.PENDIENTE,
          respuestasCorrectas: 0,
          vidasRestantes: null,
          xpGanado: 0,
          _count: { respuestas: 0 },
        },
      ],
      preguntas: [
        {
          preguntaId: 'pregunta-1',
          orden: 0,
          opcionesOrden: ['respuesta-b', 'respuesta-a'],
          pregunta: {
            id: 'pregunta-1',
            enunciado: 'Pregunta segura',
            explicacion: 'Porque A es correcta.',
            imagenUrl: null,
            caso: null,
            respuestas: [
              {
                id: 'respuesta-a',
                texto: 'A',
                esCorrecta: true,
                explicacion: null,
              },
              {
                id: 'respuesta-b',
                texto: 'B',
                esCorrecta: false,
                explicacion: null,
              },
            ],
          },
        },
      ],
      respuestas: [
        {
          preguntaId: 'pregunta-1',
          respuestaSeleccionadaId: 'respuesta-b',
          esCorrecta: false,
        },
      ],
    };
  }
});
