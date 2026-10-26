import { Prisma } from '@prisma/client';
import { editorialImagePath } from './editorial-image-reference';

type Database = Pick<Prisma.TransactionClient, '$queryRaw'>;

function references(path: string) {
  return Prisma.sql`(m."snapshotInicial" @> ${JSON.stringify({ questions: [{ pregunta: { imagenUrl: path } }] })}::jsonb
    OR m."snapshotInicial" @> ${JSON.stringify({ questions: [{ pregunta: { contexto: { imagenUrl: path } } }] })}::jsonb
    OR m."snapshotInicial" @> ${JSON.stringify({ questions: [{ pregunta: { respuestas: [{ imagenUrl: path }] } }] })}::jsonb)`;
}

// Retener la copia privada no concede permiso para leer sus imágenes.
export async function hasTugSnapshotImageReference(db: Database, id: string) {
  const result = await db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
    SELECT EXISTS(SELECT 1 FROM "PartidaTiraAfloja" m
      WHERE ${references(editorialImagePath(id.toLowerCase()))}) AS used`);
  return result?.[0]?.used === true;
}

export async function canReadTugSnapshotImage(
  db: Database,
  id: string,
  owner: string,
) {
  const path = editorialImagePath(id.toLowerCase());
  const questions = Prisma.sql`CASE WHEN jsonb_typeof(m."snapshotInicial"->'questions') = 'array'
    THEN m."snapshotInicial"->'questions' ELSE '[]'::jsonb END`;
  const options = Prisma.sql`CASE WHEN jsonb_typeof(q.item->'pregunta'->'respuestas') = 'array'
    THEN q.item->'pregunta'->'respuestas' ELSE '[]'::jsonb END`;
  const order = Prisma.sql`CASE WHEN jsonb_typeof(q.item->'opcionesOrden') = 'array'
    THEN q.item->'opcionesOrden' ELSE '[]'::jsonb END`;
  const result = await db.$queryRaw<{ allowed: boolean }[]>(Prisma.sql`
    SELECT EXISTS(SELECT 1 FROM "PartidaTiraAfloja" m
      JOIN "TiraAflojaRondaPresentada" p ON p."partidaId" = m.id AND p."usuarioId" = ${owner}::uuid
      JOIN "TiraAflojaRondaPresentada" other ON other."partidaId" = m.id AND other.ronda = p.ronda
        AND other."usuarioId" = CASE WHEN p."usuarioId" = m."jugadorAId" THEN m."jugadorBId" ELSE m."jugadorAId" END
      CROSS JOIN LATERAL jsonb_array_elements(${questions}) WITH ORDINALITY q(item, position)
      WHERE m."evidenciaVersion" = 1 AND m."versionReglas" = 1
        AND (m."certificacionRVersion" IS NULL OR m."certificacionRVersion" = 1)
        AND m."jugadorBId" IS NOT NULL AND m."jugadorAId" <> m."jugadorBId"
        AND p."usuarioId" IN (m."jugadorAId",m."jugadorBId")
        AND m."snapshotInicial"->'version' = '1'::jsonb
        AND m."snapshotInicial"->'participants' = jsonb_build_object('A',m."jugadorAId",'B',m."jugadorBId")
        AND m."snapshotInicial"->'config'->'area' = to_jsonb(m)->'area'
        AND m."snapshotInicial"->'config'->'versionReglas' = '1'::jsonb
        AND m."snapshotInicial"->'qPartida' = to_jsonb(m."qPartida")
        AND jsonb_array_length(${questions}) = m."qPartida" AND m."qPartida" BETWEEN 4 AND 20
        AND ${references(path)}
        AND p.ronda = q.position AND p.ronda <= m."rondaActual"
        AND q.item->'orden' = to_jsonb(q.position) AND q.item->>'preguntaId' = p."preguntaId"
        AND q.item->'pregunta'->>'id' = p."preguntaId"
        AND other."preguntaId" = p."preguntaId" AND other."programadaEn" = p."programadaEn"
        AND other."venceEn" = p."venceEn"
        AND p."programadaEn" <= p."presentadaEn" AND p."presentadaEn" < p."venceEn"
        AND other."programadaEn" <= other."presentadaEn" AND other."presentadaEn" < other."venceEn"
        AND p."presentadaEn" <= timezone('UTC',clock_timestamp())
        AND p."registradaEn" <= timezone('UTC',clock_timestamp())
        AND other."registradaEn" <= timezone('UTC',clock_timestamp())
        AND (m."certificacionRVersion" IS NULL OR EXISTS(SELECT 1 FROM "TugRoundVisibility" c
          WHERE c."partidaId" = m.id AND c.ronda = p.ronda
            AND c."origenXid" = p."origenXid" AND c."origenPid" = p."origenPid"
            AND c."origenXid" = other."origenXid" AND c."origenPid" = other."origenPid"
            AND c."observadaEn" < c."limiteEn" AND c."observadaEn" <= timezone('UTC',clock_timestamp())))
        AND jsonb_array_length(${options}) = jsonb_array_length(${order})
        AND jsonb_array_length(${options}) >= 2
        AND (q.item->'pregunta'->>'imagenUrl' = ${path}
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(${options}) option
            WHERE option->>'imagenUrl' = ${path} AND ${order} @> jsonb_build_array(option->>'id')))
    ) AS allowed`);
  return result?.[0]?.allowed === true;
}
