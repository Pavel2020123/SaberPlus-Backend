import { BadRequestException } from '@nestjs/common';
import { PrioridadDocente } from '@prisma/client';
import {
  priorityApplies,
  priorityDeadline,
  priorityFingerprint,
  priorityProgress,
  prioritySummary,
} from './teacher-priorities.rules';

const now = new Date('2026-09-13T15:00:00Z');
const priority: PrioridadDocente = {
  id: 'priority',
  claseId: 'group',
  creadoPorId: 'teacher',
  huellaSolicitud: 'private',
  area: 'MATEMATICAS',
  temaId: 'theme',
  temaNombre: 'Proporciones',
  subtemaId: null,
  subtemaNombre: null,
  preguntaIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
  metaPreguntas: 5,
  creadoEn: new Date('2026-09-12T15:00:00Z'),
  venceEn: now,
  retiradoEn: null,
};

describe('política P3-A de práctica docente', () => {
  it.each([
    '2026-09-14',
    '2026-09-14T15:00:00',
    'invalidZ',
    '2026-09-13T15:00:00Z',
    '2026-10-14T15:00:00Z',
  ])('rechaza plazo inválido o sin zona %s', (date) =>
    expect(() => priorityDeadline(date, now)).toThrow(BadRequestException),
  );
  it('admite hasta 30 días y respeta el offset colombiano', () => {
    expect(
      priorityDeadline('2026-10-13T10:00:00-05:00', now).toISOString(),
    ).toBe('2026-10-13T15:00:00.000Z');
  });
  it('vencida en el instante del límite y retirada prevalece', () => {
    expect(prioritySummary(priority, now).estado).toBe('VENCIDA');
    expect(prioritySummary({ ...priority, retiradoEn: now }, now).estado).toBe(
      'RETIRADA',
    );
    expect(prioritySummary(priority, new Date(now.getTime() - 1)).estado).toBe(
      'ACTIVA',
    );
  });
  it('no serializa snapshot de preguntas ni identidad del creador', () => {
    const result = prioritySummary(priority, now);
    for (const key of ['creadoPorId', 'huellaSolicitud', 'preguntaIds'])
      expect(result).not.toHaveProperty(key);
  });
  it('cumplimiento limita el conteo a cinco y nunca afirma dominio', () => {
    expect(priorityProgress(100)).toMatchObject({
      preguntasPracticadas: 5,
      cumplida: true,
      acreditaDominio: false,
    });
    expect(priorityProgress(4)).toMatchObject({
      cumplida: false,
      estadoCumplimiento: 'PENDIENTE',
    });
    expect(() => priorityProgress(-1)).toThrow();
    expect(() => priorityProgress(1.2)).toThrow();
  });
  it('ingreso después del plazo o retiro no se informa como incumplimiento', () => {
    expect(priorityApplies(priority, now)).toBe(false);
    expect(priorityApplies(priority, priority.creadoEn)).toBe(true);
    expect(priorityProgress(5, false)).toMatchObject({
      aplica: false,
      cumplida: false,
      estadoCumplimiento: 'NO_APLICA',
    });
    expect(
      priorityApplies(
        { ...priority, retiradoEn: priority.creadoEn },
        priority.creadoEn,
      ),
    ).toBe(false);
  });
  it('huella ata ID a actor, grupo, selección y plazo', () => {
    const dto = { id: 'id', temaId: 'topic', venceEn: now.toISOString() };
    const hash = priorityFingerprint('teacher', 'group', dto);
    expect(priorityFingerprint('teacher', 'group', { ...dto })).toBe(hash);
    expect(priorityFingerprint('other', 'group', dto)).not.toBe(hash);
    expect(priorityFingerprint('teacher', 'other', dto)).not.toBe(hash);
    expect(
      priorityFingerprint('teacher', 'group', { ...dto, subtemaId: 'sub' }),
    ).not.toBe(hash);
  });
});
