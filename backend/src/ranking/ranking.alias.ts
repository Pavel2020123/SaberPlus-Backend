import { createHmac } from 'node:crypto';

const IDENTIDADES_RANKING = [
  'Águila',
  'Colibrí',
  'Cóndor',
  'Delfín',
  'Jaguar',
  'Lince',
  'Lobo',
  'Mariposa',
  'Ocelote',
  'Quetzal',
  'Tortuga',
  'Zorro',
] as const;

/** Existing legacy pseudonym contract. This is not a user-selected profile alias. */
export function crearAliasRanking(usuarioId: string, alcance: string): string {
  const secreto =
    process.env.RANKING_ALIAS_SECRET ??
    process.env.JWT_SECRET ??
    'saberplus-ranking-development';
  const firma = createHmac('sha256', secreto)
    .update(`ranking-v1:${alcance}:${usuarioId}`)
    .digest();
  const identidad = IDENTIDADES_RANKING[firma[0] % IDENTIDADES_RANKING.length];
  const numero = (firma.readUInt32BE(1) % 900000) + 100000;
  return `Estudiante ${identidad} ${numero}`;
}
