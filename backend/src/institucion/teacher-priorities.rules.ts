import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrioridadDocente } from '@prisma/client';
import { CreateTeacherPriorityDto } from './teacher-priorities.dto';

export const PRIORITY_POLICY = {
  version: 1,
  metaPreguntas: 5,
  maximoDias: 30,
  maximoActivasGrupo: 10,
  maximoPreguntasCatalogo: 2000,
  tamanoPagina: 20,
  criterio: 'PRACTICA_UNICA_DESDE_ASIGNACION_E_INGRESO',
  acreditaDominio: false,
} as const;

export function priorityDeadline(value: string, now: Date): Date {
  // Exigir zona evita que el horario del servidor cambie el plazo solicitado.
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new BadRequestException('La fecha debe incluir zona horaria.');
  }
  const deadline = new Date(value);
  const duration = deadline.getTime() - now.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30 * 86400000) {
    throw new BadRequestException(
      'El plazo debe ser futuro y de hasta 30 días.',
    );
  }
  return deadline;
}

export function priorityFingerprint(
  actorId: string,
  groupId: string,
  dto: CreateTeacherPriorityDto,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        actorId,
        groupId,
        dto.temaId,
        dto.subtemaId ?? null,
        dto.venceEn,
      ]),
    )
    .digest('hex');
}

export function prioritySummary(priority: PrioridadDocente, now: Date) {
  return {
    id: priority.id,
    grupoId: priority.claseId,
    area: priority.area,
    tema: { id: priority.temaId, nombre: priority.temaNombre },
    subtema: priority.subtemaId
      ? { id: priority.subtemaId, nombre: priority.subtemaNombre }
      : null,
    metaPreguntas: priority.metaPreguntas,
    creadoEn: priority.creadoEn,
    venceEn: priority.venceEn,
    retiradoEn: priority.retiradoEn,
    estado: priority.retiradoEn
      ? 'RETIRADA'
      : priority.venceEn <= now
        ? 'VENCIDA'
        : 'ACTIVA',
  };
}

export function priorityApplies(
  priority: PrioridadDocente,
  joinedAt: Date,
): boolean {
  const end = Math.min(
    priority.venceEn.getTime(),
    priority.retiradoEn?.getTime() ?? Infinity,
  );
  return Math.max(priority.creadoEn.getTime(), joinedAt.getTime()) < end;
}

export function priorityProgress(uniqueQuestions: number, applies = true) {
  if (!Number.isInteger(uniqueQuestions) || uniqueQuestions < 0) {
    throw new Error('Conteo de práctica inválido.');
  }
  const count = applies
    ? Math.min(uniqueQuestions, PRIORITY_POLICY.metaPreguntas)
    : 0;
  return {
    aplica: applies,
    estadoCumplimiento: !applies
      ? 'NO_APLICA'
      : count === PRIORITY_POLICY.metaPreguntas
        ? 'CUMPLIDA'
        : 'PENDIENTE',
    preguntasPracticadas: count,
    metaPreguntas: PRIORITY_POLICY.metaPreguntas,
    cumplida: count === PRIORITY_POLICY.metaPreguntas,
    acreditaDominio: false,
  };
}
