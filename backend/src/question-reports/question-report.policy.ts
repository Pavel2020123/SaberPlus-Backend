import {
  BadRequestException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EstadoReportePregunta as State } from '@prisma/client';

export const REPORT_OPEN_STATES: State[] = [State.PENDIENTE, State.EN_REVISION];
export const REPORT_DAILY_LIMIT = 20;
export const REPORT_MINUTE_LIMIT = 20;
export const REPORT_DAY_MS = 24 * 60 * 60 * 1000;

export function reportFingerprint(
  actorId: string,
  type: string,
  payload: object,
) {
  return createHash('sha256')
    .update(JSON.stringify(['question-report-v1', actorId, type, payload]))
    .digest('hex');
}

export function validateReportDetail(motive: string, detail: string) {
  if (motive === 'OTRO' && [...detail].length < 10) {
    throw new BadRequestException({
      code: 'REPORT_DETAIL_REQUIRED',
      message: 'Describe el problema con al menos 10 caracteres.',
    });
  }
}

export function requireReportTransition(from: State, to: State) {
  const allowed: Record<State, State[]> = {
    PENDIENTE: [State.EN_REVISION],
    EN_REVISION: [State.RESUELTO, State.DESCARTADO],
    RESUELTO: [State.EN_REVISION],
    DESCARTADO: [State.EN_REVISION],
  };
  if (!allowed[from].includes(to))
    throw new ConflictException({
      code: 'REPORT_STATE_CONFLICT',
      message: 'Consulta el estado actual antes de decidir.',
    });
}

export function reportLimit(code: string, waitSeconds: number): never {
  throw new HttpException(
    {
      statusCode: 429,
      code,
      retryAfterSeconds: Math.max(1, Math.ceil(waitSeconds)),
      message:
        'Alcanzaste el límite de reportes. Espera antes de volver a intentar.',
    },
    429,
  );
}
