import { Prisma, PrismaClient } from '@prisma/client';

// This contract follows the loaded recovery workers even when admission is OFF.
const models = [
  'EventoXpCompetitivo',
  'BalanceCompetitivo',
  'HistorialInstitucionCompetitiva',
  'TugCompetitiveSettlement',
  'TugMatchIdentity',
  'PartidaTiraAfloja',
  'TiraAflojaRespuesta',
  'TiraAflojaEvento',
  'TiraAflojaRondaPresentada',
  'TugRoundVisibility',
  'TugPresence',
  'TugConnection',
  'TugPresenceEvent',
  'TugAbandonment',
  'IntentoTriviaRush',
  'TriviaPresence',
  'TriviaConnection',
  'TriviaPresenceEvent',
  'TriviaRushPregunta',
  'TriviaRushRespuesta',
  'TiraAflojaPregunta',
  'TriviaRushPotenciador',
  'IntentoCima',
  'IntentoGuardian',
  'IntentoRescateEstrellas',
];
const migrations = [
  '20260930120000_competitive_infrastructure',
  '20260930180000_competitive_solo_runtime',
  '20261001190000_trivia_authoritative_evidence',
  '20261002190000_trivia_presence',
  '20261002230000_trivia_competitive_v1',
  '20261003010000_tug_authoritative_evidence',
  '20261003160000_tug_presence',
  '20261003220000_tug_round_visibility',
  '20261004010000_tug_competitive_admission',
  '20261004160000_tug_temporal_authority',
  '20261005120000_tug_pair_settlement',
];
const functions = [
  'competitive_timestamp_us(bigint)',
  'tug_presence_now()',
  'tug_presence_lock(uuid)',
  'tug_presence_refresh(uuid,timestamp without time zone)',
  'tug_record_presented_round(uuid)',
  'tug_certify_presented_round(uuid,integer)',
  'trivia_presence_now()',
  'trivia_presence_lock(uuid)',
  'trivia_presence_resolve(uuid,timestamp without time zone)',
];
const privateTables = new Set([
  'EventoXpCompetitivo',
  'BalanceCompetitivo',
  'HistorialInstitucionCompetitiva',
  'TugCompetitiveSettlement',
  'TugRoundVisibility',
  'TiraAflojaRondaPresentada',
  'TugPresence',
  'TugConnection',
  'TugPresenceEvent',
  'TugAbandonment',
  'IntentoTriviaRush',
  'TriviaPresence',
  'TriviaConnection',
  'TriviaPresenceEvent',
]);
const tables = models.map((name) => ({
  name,
  rls: privateTables.has(name),
  // Recovery mutates these origins/projections; immutable evidence is SELECT only.
  ops: [
    'EventoXpCompetitivo',
    'HistorialInstitucionCompetitiva',
    'TugPresenceEvent',
    'TriviaPresenceEvent',
    'TugAbandonment',
    'TiraAflojaEvento',
    'TiraAflojaRespuesta',
  ].includes(name)
    ? ['SELECT', 'INSERT']
    : ['BalanceCompetitivo', 'TugCompetitiveSettlement'].includes(name)
      ? ['SELECT', 'INSERT', 'UPDATE']
      : [
            'PartidaTiraAfloja',
            'IntentoTriviaRush',
            'IntentoCima',
            'IntentoGuardian',
            'IntentoRescateEstrellas',
            'TugPresence',
            'TugConnection',
            'TriviaPresence',
            'TriviaConnection',
          ].includes(name)
        ? ['SELECT', 'UPDATE']
        : ['SELECT'],
}));
tables.push({ name: 'Usuario', rls: false, ops: ['SELECT', 'UPDATE'] });
// Native UUIDs are part of the raw-SQL locking/identity contract, not generic strings.
const uuidFields: Record<string, string> = {
  EventoXpCompetitivo: 'id,usuarioId,institucionId,eventoCorregidoId,actorId',
  BalanceCompetitivo: 'usuarioId',
  HistorialInstitucionCompetitiva: 'usuarioId,institucionId',
  TugCompetitiveSettlement: 'sourceId',
  TugMatchIdentity: 'id',
  PartidaTiraAfloja:
    'competitiveOriginalAId,competitiveOriginalBId,id,jugadorAId,jugadorBId,ganadorId',
  TiraAflojaRespuesta: 'id,partidaId,usuarioId,claveIdempotencia',
  TiraAflojaEvento: 'id,partidaId',
  TiraAflojaRondaPresentada: 'partidaId,usuarioId',
  TugRoundVisibility: 'partidaId',
  TugPresence: 'matchId,userId',
  TugConnection: 'id,matchId,userId,instanceId',
  TugPresenceEvent: 'matchId,userId,connectionId',
  TugAbandonment: 'matchId,userId',
  IntentoTriviaRush: 'id,usuarioId',
  TriviaPresence: 'attemptId',
  TriviaConnection: 'id,attemptId,instanceId',
  TriviaPresenceEvent: 'attemptId,connectionId',
  TriviaRushPregunta: 'intentoId',
  TriviaRushRespuesta: 'id,intentoId,claveIdempotencia',
  TiraAflojaPregunta: 'partidaId',
  TriviaRushPotenciador: 'id,intentoId,concesionId,claveIdempotencia',
  IntentoCima: 'id,usuarioId',
  IntentoGuardian: 'id,usuarioId',
  IntentoRescateEstrellas: 'id,usuarioId',
  Usuario: 'id,institucionId',
};
const columns = models.flatMap((name) =>
  Prisma.dmmf.datamodel.models
    .find((m) => m.name === name)!
    .fields.filter((f) => f.kind !== 'object')
    .map((f) => ({
      table: name,
      name: f.dbName ?? f.name,
      type:
        (f.isList ? '_' : '') +
        (uuidFields[name]?.split(',').includes(f.name)
          ? 'uuid'
          : f.kind === 'enum'
            ? f.type
            : ((
                {
                  Int: 'int4',
                  BigInt: 'int8',
                  Boolean: 'bool',
                  Json: 'jsonb',
                  Float: 'float8',
                } as Record<string, string>
              )[f.type] ?? f.type)),
    })),
);

columns.push({ table: 'Usuario', name: 'id', type: 'uuid' });
const enums = Prisma.dmmf.datamodel.enums
  .filter((e) =>
    columns.some((c) => c.type === e.name || c.type === '_' + e.name),
  )
  .flatMap((e) =>
    e.values.map((v) => ({
      type: e.dbName ?? e.name,
      value: v.dbName ?? v.name,
    })),
  );

/** Catalog checks cannot prove that a real INSERT passes every trigger/policy.
 * That guarantee belongs to the separate rollback/operational probes, not health.
 * No elevated role, business function invocation or application row is needed. */
export async function checkCompetitiveReadiness(
  database: PrismaClient,
): Promise<void> {
  await database.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      await tx.$executeRaw`SET LOCAL statement_timeout = '1500ms'`;
      await inspectCompetitiveReadiness(tx);
    },
    { maxWait: 1000, timeout: 2500 },
  );
}

/** Reusable SELECT-only probe on an existing transaction, including role tests. */
export async function inspectCompetitiveReadiness(
  tx: Prisma.TransactionClient,
): Promise<void> {
  // A missing migration table is deliberately an error, never a successful probe.
  const [migration] = await tx.$queryRaw<{ ok: boolean }[]>`
      SELECT NOT EXISTS (SELECT 1 FROM unnest(${migrations}::text[]) required(name)
        WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations m
          WHERE m.migration_name=required.name AND m.finished_at IS NOT NULL AND m.rolled_back_at IS NULL))
        AND NOT EXISTS (SELECT 1 FROM public._prisma_migrations
          WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS ok`;
  if (!migration?.ok) throw new Error('COMPETITIVE_READINESS_UNAVAILABLE');
  const [schema] = await tx.$queryRaw<{ ok: boolean }[]>(Prisma.sql`
      WITH required AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(tables)}::jsonb)
        AS r(name text,rls boolean,ops jsonb)),
      shape AS (SELECT * FROM jsonb_to_recordset(${JSON.stringify(columns)}::jsonb)
        AS s("table" text,name text,type text)),
      identity AS (SELECT oid,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user)
      SELECT NOT EXISTS (
        SELECT 1 FROM required r LEFT JOIN pg_class c ON c.oid=to_regclass(format('public.%I',r.name))
        CROSS JOIN identity i WHERE c.oid IS NULL OR c.relkind<>'r'
        OR (r.rls AND NOT c.relrowsecurity)
        OR NOT has_schema_privilege(current_user,'public','USAGE')
        OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(r.ops) op
          WHERE NOT has_table_privilege(current_user,c.oid,op))
        OR (c.relrowsecurity AND NOT (i.rolsuper OR i.rolbypassrls OR
          (c.relowner=i.oid AND NOT c.relforcerowsecurity)) AND (
          -- Conservative catalog proof: unconditional private backend policies.
          NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polcmd='*'
            AND p.polpermissive AND pg_get_expr(p.polqual,p.polrelid)='true'
            AND coalesce(pg_get_expr(p.polwithcheck,p.polrelid),pg_get_expr(p.polqual,p.polrelid))='true'
            AND EXISTS(SELECT 1 FROM unnest(p.polroles) role_id
              WHERE CASE WHEN role_id=0 THEN true ELSE pg_has_role(current_user,role_id,'USAGE') END))
          OR EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive
            AND EXISTS(SELECT 1 FROM unnest(p.polroles) role_id
              WHERE CASE WHEN role_id=0 THEN true ELSE pg_has_role(current_user,role_id,'USAGE') END)
            AND (coalesce(pg_get_expr(p.polqual,p.polrelid),'true')<>'true'
              OR coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'true')<>'true')))))
      AND NOT EXISTS (SELECT 1 FROM shape s
        LEFT JOIN pg_attribute a ON a.attrelid=to_regclass(format('public.%I',s."table"))
          AND a.attname=s.name AND a.attnum>0 AND NOT a.attisdropped
        LEFT JOIN pg_type t ON t.oid=a.atttypid WHERE a.attname IS NULL
          OR CASE s.type WHEN 'String' THEN t.typname NOT IN ('text','varchar','uuid')
            WHEN 'DateTime' THEN t.typname NOT IN ('timestamp','timestamptz')
            ELSE t.typname<>s.type END)
      AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(enums)}::jsonb) AS e(type text,value text)
        WHERE NOT EXISTS (SELECT 1 FROM pg_enum p WHERE p.enumtypid=to_regtype(format('public.%I',e.type)) AND p.enumlabel=e.value))
      AND NOT EXISTS (SELECT 1 FROM unnest(${functions}::text[]) f(signature)
        WHERE to_regprocedure('public.'||f.signature) IS NULL
          OR NOT has_function_privilege(current_user,to_regprocedure('public.'||f.signature),'EXECUTE'))
      AND NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND
        ((c.relname='EventoXpCompetitivo' AND a.attname='fechaEfectiva') OR
         (c.relname='PartidaTiraAfloja' AND a.attname IN ('activaEn','fechaFinalizacion','rondaIniciaEn','rondaVenceEn','expiraEn')))
        AND a.atttypmod<>6)
      AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY['HistorialInstitucionCompetitiva','TugPresenceEvent','TriviaPresenceEvent']) relation(name)
        WHERE pg_get_serial_sequence(format('public.%I',relation.name),'id') IS NULL
          OR NOT has_sequence_privilege(current_user,pg_get_serial_sequence(format('public.%I',relation.name),'id'),'USAGE'))
      AND EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public."EventoXpCompetitivo_sourceType_sourceId_usuarioId_liquidacion_key"') AND indisunique AND indisvalid)
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public."TugCompetitiveSettlement"') AND tgname='tug_settlement_guard' AND tgenabled='O')
      AS ok`);
  if (!schema?.ok) throw new Error('COMPETITIVE_READINESS_UNAVAILABLE');
}
