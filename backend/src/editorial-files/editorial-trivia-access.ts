import { Prisma } from '@prisma/client';
import { editorialImagePath } from './editorial-image-reference';

type Database = Pick<Prisma.TransactionClient, '$queryRaw'>;
// Dos orígenes privados diferentes. CPU no se inscribe en evidencia/presencia.
const sources = [
  {
    column: 'snapshotInicial',
    modes: ['TRIVIA_RUSH', 'GHOST_DUEL'],
    minimum: 10,
    evidence: Prisma.sql`s."evidenciaVersion" = 1`,
  },
  {
    column: 'snapshotLocal',
    modes: ['TUG_LOCAL'],
    minimum: 4,
    evidence: Prisma.sql`s."evidenciaVersion" IS NULL`,
  },
] as const;

function imageMatches(media: Prisma.Sql, path: string) {
  return Prisma.sql`(${media} @> ${JSON.stringify({ questions: [{ pregunta: { imagenUrl: path } }] })}::jsonb
    OR ${media} @> ${JSON.stringify({ questions: [{ pregunta: { caso: { imagenUrl: path } } }] })}::jsonb
    OR ${media} @> ${JSON.stringify({ questions: [{ pregunta: { respuestas: [{ imagenUrl: path }] } }] })}::jsonb)`;
}

export async function hasTriviaSnapshotImageReference(
  db: Database,
  id: string,
) {
  const path = editorialImagePath(id.toLowerCase());
  const queries = sources.map(
    ({ column }) => Prisma.sql`
    SELECT 1 FROM "IntentoTriviaRush" s WHERE ${imageMatches(Prisma.raw(`s."${column}"`), path)}`,
  );
  const result = await db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
    SELECT EXISTS(${Prisma.join(queries, ' UNION ALL ')}) AS used`);
  return result?.[0]?.used === true;
}

export async function canReadTriviaSnapshotImage(
  db: Database,
  id: string,
  owner: string,
) {
  const path = editorialImagePath(id.toLowerCase());
  const queries = sources.map(({ column, modes, minimum, evidence }) => {
    const media = Prisma.raw(`s."${column}"`);
    const questions = Prisma.sql`CASE WHEN jsonb_typeof(${media}->'questions') = 'array'
      THEN ${media}->'questions' ELSE '[]'::jsonb END`;
    const options = Prisma.sql`CASE WHEN jsonb_typeof(q.item->'pregunta'->'respuestas') = 'array'
      THEN q.item->'pregunta'->'respuestas' ELSE '[]'::jsonb END`;
    const order = Prisma.sql`CASE WHEN jsonb_typeof(q.item->'opcionesOrden') = 'array'
      THEN q.item->'opcionesOrden' ELSE '[]'::jsonb END`;
    return Prisma.sql`SELECT 1 FROM "IntentoTriviaRush" s
      CROSS JOIN LATERAL jsonb_array_elements(${questions}) WITH ORDINALITY q(item, position)
      WHERE s."usuarioId" = ${owner}::uuid AND ${evidence}
        AND s.modalidad::text IN (${Prisma.join([...modes])})
        AND jsonb_typeof(${media}) = 'object' AND ${media}->'version' = '1'::jsonb
        AND jsonb_array_length(${questions}) BETWEEN ${minimum} AND 30
        AND ${media}->'q' = to_jsonb(jsonb_array_length(${questions}))
        AND ${media}->'config'->>'modalidad' = s.modalidad::text
        AND ${media}->'config'->'areas' = to_jsonb(s.areas)
        AND ${media}->'config'->'duracionSegundos' = to_jsonb(s."duracionBaseSegundos")
        AND ${media}->'config'->'versionReglas' = to_jsonb(s."versionReglas") AND s."versionReglas" = 1
        AND ${imageMatches(media, path)}
        AND q.item->'orden' = to_jsonb(q.position - 1)
        AND q.item->>'preguntaId' = q.item->'pregunta'->>'id'
        AND jsonb_typeof(q.item->'pregunta'->'enunciado') = 'string'
        AND jsonb_array_length(${options}) = 4 AND jsonb_array_length(${order}) = 4
        AND (
          -- La pregunta actual sigue accesible durante un segundo intento/pausa,
          -- pero no después del cierre/plazo global ni por un contador inventado.
          (s.estado = 'ACTIVO' AND s."venceEn" > timezone('UTC',clock_timestamp())
            AND s."indiceActual" = q.position - 1 AND s."preguntaActualId" = q.item->>'preguntaId'
            AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(${questions}) WITH ORDINALITY previous(item, position)
              WHERE previous.position < q.position AND NOT EXISTS (SELECT 1 FROM "TriviaRushRespuesta" r
                WHERE r."intentoId" = s.id AND r."preguntaId" = previous.item->>'preguntaId' AND r."esFinal")))
          OR EXISTS (SELECT 1 FROM "TriviaRushRespuesta" r
            WHERE r."intentoId" = s.id AND r."preguntaId" = q.item->>'preguntaId' AND r."esFinal"
              AND (r."respuestaSeleccionadaId" IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(${options}) option
                WHERE option->>'id' = r."respuestaSeleccionadaId"
                  AND option->'esCorrecta' = to_jsonb(r."esCorrecta"))))
        )
        AND (
          -- PresentarPreguntaPublica muestra el caso solo como fallback del
          -- enunciado; y únicamente las opciones presentes en opcionesOrden.
          COALESCE(q.item->'pregunta'->>'imagenUrl',q.item->'pregunta'->'caso'->>'imagenUrl') = ${path}
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(${options}) option
            WHERE option->>'imagenUrl' = ${path} AND ${order} @> jsonb_build_array(option->>'id'))
        )`;
  });
  const result = await db.$queryRaw<{ allowed: boolean }[]>(Prisma.sql`
    SELECT EXISTS(${Prisma.join(queries, ' UNION ALL ')}) AS allowed`);
  return result?.[0]?.allowed === true;
}
