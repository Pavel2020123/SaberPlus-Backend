import { Prisma } from '@prisma/client';
import { editorialImagePath } from './editorial-image-reference';
type Database = Pick<Prisma.TransactionClient, '$queryRaw'>;
function references(path: string) {
  return Prisma.sql`(p."snapshotInicial" @> ${JSON.stringify({ pregunta: { imagenUrl: path } })}::jsonb
    OR p."snapshotInicial" @> ${JSON.stringify({ pregunta: { caso: { imagenUrl: path } } })}::jsonb
    OR p."snapshotInicial" @> ${JSON.stringify({ pregunta: { respuestas: [{ imagenUrl: path }] } })}::jsonb)`;
}
export async function hasBattleSnapshotImageReference(
  db: Database,
  id: string,
) {
  const result = await db.$queryRaw<{ used: boolean }[]>(Prisma.sql`
    SELECT EXISTS(SELECT 1 FROM "BatallaPregunta" p WHERE ${references(editorialImagePath(id.toLowerCase()))}) AS used`);
  return result?.[0]?.used === true;
}
export async function canReadBattleSnapshotImage(
  db: Database,
  id: string,
  owner: string,
) {
  const path = editorialImagePath(id.toLowerCase());
  const options = Prisma.sql`CASE WHEN jsonb_typeof(p."snapshotInicial"->'pregunta'->'respuestas')='array'
    THEN p."snapshotInicial"->'pregunta'->'respuestas' ELSE '[]'::jsonb END`;
  const result = await db.$queryRaw<{ allowed: boolean }[]>(Prisma.sql`
    SELECT EXISTS(SELECT 1 FROM "BatallaPregunta" p JOIN "Batalla" b ON b.id=p."batallaId"
    JOIN "BatallaParticipante" u ON u."batallaId"=b.id AND u."usuarioId"=${owner}::uuid
    WHERE u."usuarioId" IN (b."retadorId",b."rivalId") AND ${references(path)}
      AND p."snapshotInicial"->'version'='1'::jsonb AND p."snapshotInicial"->>'preguntaId'=p."preguntaId"
      AND p."snapshotInicial"->'orden'=to_jsonb(p.orden) AND p."snapshotInicial"->'opcionesOrden'=p."opcionesOrden"
      AND p."snapshotInicial"->'pregunta'->>'id'=p."preguntaId"
      AND (
        EXISTS(SELECT 1 FROM "BatallaRespuesta" r CROSS JOIN LATERAL jsonb_array_elements(${options}) option
          WHERE r."batallaId"=b.id AND r."usuarioId"=u."usuarioId" AND r."preguntaId"=p."preguntaId" AND r.orden=p.orden
            AND option->>'id'=r."respuestaSeleccionadaId" AND option->'esCorrecta'=to_jsonb(r."esCorrecta"))
        OR (b.estado='ACTIVA' AND b."expiraEn">timezone('UTC',clock_timestamp()) AND u.estado='EN_JUEGO' AND u."iniciadoEn" IS NOT NULL
          AND NOT EXISTS(SELECT 1 FROM "BatallaRespuesta" r WHERE r."batallaId"=b.id AND r."usuarioId"=u."usuarioId" AND r.orden=p.orden)
          AND NOT EXISTS(SELECT 1 FROM "BatallaPregunta" previous WHERE previous."batallaId"=b.id AND previous.orden<p.orden
            AND NOT EXISTS(SELECT 1 FROM "BatallaRespuesta" r WHERE r."batallaId"=b.id AND r."usuarioId"=u."usuarioId" AND r.orden=previous.orden AND r."preguntaId"=previous."preguntaId")))
      ) AND (COALESCE(p."snapshotInicial"->'pregunta'->>'imagenUrl',p."snapshotInicial"->'pregunta'->'caso'->>'imagenUrl')=${path}
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(${options}) option WHERE option->>'imagenUrl'=${path}
          AND p."opcionesOrden" @> jsonb_build_array(option->>'id')))) AS allowed`);
  return result?.[0]?.allowed === true;
}
