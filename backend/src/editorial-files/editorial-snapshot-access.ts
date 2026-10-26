import { Prisma } from '@prisma/client';
import { editorialImagePath } from './editorial-image-reference';

// Allowlist del servidor. Nunca interpolar un nombre de tabla del cliente.
const sources = [
  { table: 'IntentoCima', size: 12 },
  { table: 'IntentoGuardian', size: 8 },
  { table: 'IntentoRescateEstrellas', size: 10 },
] as const;
type Database = Pick<Prisma.TransactionClient, '$queryRaw'>;

const questions = Prisma.sql`CASE WHEN jsonb_typeof(s."preguntas") = 'array'
  THEN s."preguntas" ELSE '[]'::jsonb END`;
const answers = Prisma.sql`CASE WHEN jsonb_typeof(s."respuestas") = 'array'
  THEN s."respuestas" ELSE '[]'::jsonb END`;

// @> coincide con el índice GIN y solo reconoce los tres campos públicos. No
// busca cadenas recursivamente dentro de soluciones, notas o metadatos privados.
function references(path: string) {
  return Prisma.sql`(s."preguntas" @> ${JSON.stringify([{ question: { imagenUrl: path } }])}::jsonb
    OR s."preguntas" @> ${JSON.stringify([{ question: { caso: { imagenUrl: path } } }])}::jsonb
    OR s."preguntas" @> ${JSON.stringify([{ question: { respuestas: [{ imagenUrl: path }] } }])}::jsonb)`;
}

export async function hasSoloSnapshotImageReference(db: Database, id: string) {
  const path = editorialImagePath(id.toLowerCase());
  // Para conservar bytes, proteger también preguntas futuras/versiones desconocidas.
  // Esa protección NO es un permiso de lectura ni divulga quién usa el recurso.
  const queries = sources.map(
    ({ table }) => Prisma.sql`
    SELECT 1 FROM ${Prisma.raw(`"${table}"`)} s WHERE ${references(path)}`,
  );
  const result = await db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
    SELECT EXISTS(${Prisma.join(queries, ' UNION ALL ')}) AS used`);
  return result?.[0]?.used === true;
}

export async function canReadSoloSnapshotImage(
  db: Database,
  id: string,
  actorId: string,
) {
  const path = editorialImagePath(id.toLowerCase());
  const queries = sources.map(
    ({ table, size }) => Prisma.sql`
    SELECT 1 FROM ${Prisma.raw(`"${table}"`)} s
    CROSS JOIN LATERAL jsonb_array_elements(${questions}) WITH ORDINALITY q(item, position)
    WHERE s."usuarioId" = ${actorId}::uuid AND s."version" = 1
      AND s."estado" IN ('ACTIVO','VICTORIA','DERROTA','AGOTADO','ABANDONADO','EXPIRADO')
      AND jsonb_typeof(s."preguntas") = 'array' AND jsonb_array_length(${questions}) = ${size}
      AND jsonb_typeof(s."respuestas") = 'array' AND jsonb_array_length(${answers}) <= ${size}
      AND ${references(path)}
      AND jsonb_typeof(q.item->'question') = 'object'
      AND jsonb_typeof(q.item->'question'->'id') = 'string'
      AND length(q.item->'question'->>'id') > 0
      AND jsonb_typeof(q.item->'question'->'enunciado') = 'string'
      AND jsonb_typeof(q.item->'correctAnswerId') = 'string'
      AND jsonb_typeof(q.item->'question'->'respuestas') = 'array'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(q.item->'question'->'respuestas') = 'array'
          THEN q.item->'question'->'respuestas' ELSE '[]'::jsonb END) option
        WHERE option->>'id' = q.item->>'correctAnswerId')
      AND (q.position <= jsonb_array_length(${answers})
        OR (q.position = jsonb_array_length(${answers}) + 1
          AND s."estado" = 'ACTIVO' AND s."venceEn" > CURRENT_TIMESTAMP))
      AND (q.item->'question'->>'imagenUrl' = ${path}
        OR q.item->'question'->'caso'->>'imagenUrl' = ${path}
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(q.item->'question'->'respuestas') = 'array'
            THEN q.item->'question'->'respuestas' ELSE '[]'::jsonb END) option
          WHERE option->>'imagenUrl' = ${path}))
      -- La longitud sola no prueba avance: validar el prefijo confirmado completo
      -- y que cada opción pertenece a la pregunta original en esa posición.
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(${answers}) WITH ORDINALITY a(item, position)
        WHERE jsonb_typeof(a.item) IS DISTINCT FROM 'object'
          OR jsonb_typeof(a.item->'preguntaId') IS DISTINCT FROM 'string'
          OR length(COALESCE(a.item->>'preguntaId','')) = 0
          OR (a.item->>'preguntaId') IS DISTINCT FROM
            (${questions}->(a.position::int - 1)->'question'->>'id')
          OR jsonb_typeof(a.item->'esCorrecta') IS DISTINCT FROM 'boolean'
          OR (a.item->'esCorrecta') IS DISTINCT FROM to_jsonb(
            (a.item->>'respuestaId') = (${questions}->(a.position::int - 1)->>'correctAnswerId'))
          OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(${questions}->(a.position::int - 1)->'question'->'respuestas') = 'array'
              THEN ${questions}->(a.position::int - 1)->'question'->'respuestas'
              ELSE '[]'::jsonb END) option
            WHERE jsonb_typeof(option->'id') = 'string'
              AND option->>'id' = a.item->>'respuestaId')
      )`,
  );
  const result = await db.$queryRaw<{ allowed: boolean }[]>(Prisma.sql`
    SELECT EXISTS(${Prisma.join(queries, ' UNION ALL ')}) AS allowed`);
  return result?.[0]?.allowed === true;
}
