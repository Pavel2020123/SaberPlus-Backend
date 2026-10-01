BEGIN;
CREATE TYPE "JuegoCompetitivo" AS ENUM ('TRIVIA_RUSH','GHOST_DUEL','SUMMIT','TUG_OF_WAR','GUARDIAN','MEMORY_MATCH','BATTLES','STAR_RESCUE');
CREATE TYPE "TipoEventoXpCompetitivo" AS ENUM ('RESULTADO','ABANDONO','VICTORIA_POR_ABANDONO','CORRECCION');
CREATE TYPE "FuenteXpCompetitivo" AS ENUM ('TRIVIA_ATTEMPT','SUMMIT_ATTEMPT','TUG_MATCH','GUARDIAN_ATTEMPT','MEMORY_ATTEMPT','BATTLE','STAR_RESCUE_ATTEMPT');
CREATE TYPE "EstadoEventoXpCompetitivo" AS ENUM ('APLICADO');

CREATE TABLE "BalanceCompetitivo" (
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "gameId" "JuegoCompetitivo" NOT NULL,
  temporada INTEGER NOT NULL CHECK (temporada BETWEEN 1 AND 9999),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  "alcanzadoEn" TIMESTAMPTZ(3),
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  PRIMARY KEY ("usuarioId", "gameId", temporada)
);
CREATE INDEX "BalanceCompetitivo_gameId_temporada_idx" ON "BalanceCompetitivo" ("gameId", temporada);

CREATE TABLE "EventoXpCompetitivo" (
  id UUID PRIMARY KEY,
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "gameId" "JuegoCompetitivo" NOT NULL,
  temporada INTEGER NOT NULL CHECK (temporada BETWEEN 1 AND 9999),
  "xpRulesVersion" INTEGER NOT NULL CHECK ("xpRulesVersion" > 0),
  tipo "TipoEventoXpCompetitivo" NOT NULL,
  "deltaNominal" INTEGER NOT NULL,
  "deltaAplicado" INTEGER NOT NULL,
  "saldoAntes" INTEGER NOT NULL CHECK ("saldoAntes" >= 0),
  "saldoDespues" INTEGER NOT NULL CHECK ("saldoDespues" >= 0),
  secuencia INTEGER NOT NULL CHECK (secuencia > 0),
  "sourceType" "FuenteXpCompetitivo" NOT NULL,
  "sourceId" VARCHAR(120) NOT NULL CHECK ("sourceId" ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'),
  liquidacion VARCHAR(50) NOT NULL,
  "idempotencyKey" VARCHAR(64) NOT NULL,
  "evidenciaHash" VARCHAR(64) NOT NULL,
  "institucionId" UUID,
  "fechaEfectiva" TIMESTAMPTZ(3) NOT NULL,
  "fechaRegistro" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado "EstadoEventoXpCompetitivo" NOT NULL DEFAULT 'APLICADO',
  "eventoCorregidoId" UUID REFERENCES "EventoXpCompetitivo"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" UUID,
  motivo VARCHAR(500),
  metadata JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT competitive_delta CHECK ("deltaAplicado" = greatest("deltaNominal", -"saldoAntes") AND "saldoDespues"::bigint = "saldoAntes"::bigint + "deltaAplicado"::bigint),
  CONSTRAINT competitive_season CHECK (temporada = extract(year FROM "fechaEfectiva" AT TIME ZONE 'America/Bogota')),
  CONSTRAINT competitive_hash CHECK ("idempotencyKey" ~ '^[a-f0-9]{64}$' AND "evidenciaHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT competitive_kind CHECK (
    (tipo IN ('RESULTADO','ABANDONO','VICTORIA_POR_ABANDONO') AND liquidacion = 'SETTLEMENT' AND "eventoCorregidoId" IS NULL AND "actorId" IS NULL)
    OR (tipo = 'CORRECCION' AND liquidacion <> 'SETTLEMENT' AND "eventoCorregidoId" IS NOT NULL AND "actorId" IS NOT NULL AND motivo IS NOT NULL AND length(trim(motivo)) > 0)
  ),
  CONSTRAINT competitive_reward CHECK ((tipo <> 'RESULTADO' OR "deltaNominal" BETWEEN 0 AND 100) AND (tipo <> 'VICTORIA_POR_ABANDONO' OR "deltaNominal" BETWEEN 0 AND 80) AND (tipo <> 'ABANDONO' OR "deltaNominal" = CASE WHEN "gameId" IN ('TUG_OF_WAR','BATTLES') THEN -15 ELSE -10 END)),
  CONSTRAINT competitive_memory_disabled CHECK ("gameId" <> 'MEMORY_MATCH'),
  CONSTRAINT competitive_source CHECK (
    ("gameId" IN ('TRIVIA_RUSH','GHOST_DUEL') AND "sourceType" = 'TRIVIA_ATTEMPT') OR
    ("gameId" = 'SUMMIT' AND "sourceType" = 'SUMMIT_ATTEMPT') OR
    ("gameId" = 'TUG_OF_WAR' AND "sourceType" = 'TUG_MATCH') OR
    ("gameId" = 'GUARDIAN' AND "sourceType" = 'GUARDIAN_ATTEMPT') OR
    ("gameId" = 'BATTLES' AND "sourceType" = 'BATTLE') OR
    ("gameId" = 'STAR_RESCUE' AND "sourceType" = 'STAR_RESCUE_ATTEMPT')
  )
);
CREATE UNIQUE INDEX "EventoXpCompetitivo_idempotencyKey_key" ON "EventoXpCompetitivo" ("idempotencyKey");
CREATE UNIQUE INDEX "EventoXpCompetitivo_sourceType_sourceId_usuarioId_liquidacion_key" ON "EventoXpCompetitivo" ("sourceType","sourceId","usuarioId",liquidacion);
CREATE UNIQUE INDEX "EventoXpCompetitivo_usuarioId_gameId_temporada_secuencia_key" ON "EventoXpCompetitivo" ("usuarioId","gameId",temporada,secuencia);
CREATE INDEX "EventoXpCompetitivo_gameId_temporada_idx" ON "EventoXpCompetitivo" ("gameId",temporada);
CREATE INDEX "EventoXpCompetitivo_institucionId_temporada_idx" ON "EventoXpCompetitivo" ("institucionId",temporada);
CREATE INDEX "EventoXpCompetitivo_fechaEfectiva_idx" ON "EventoXpCompetitivo" ("fechaEfectiva");
CREATE INDEX "EventoXpCompetitivo_eventoCorregidoId_idx" ON "EventoXpCompetitivo" ("eventoCorregidoId");

CREATE TABLE "HistorialInstitucionCompetitiva" (
  id BIGSERIAL PRIMARY KEY,
  "usuarioId" UUID NOT NULL,
  "institucionId" UUID,
  desde TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "HistorialInstitucionCompetitiva_usuarioId_desde_id_idx" ON "HistorialInstitucionCompetitiva" ("usuarioId",desde,id);
-- Serialize activation against current membership mutations; no historical backfill.
LOCK TABLE "Usuario" IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO "HistorialInstitucionCompetitiva" ("usuarioId","institucionId",desde)
SELECT id,"institucionId",clock_timestamp() FROM "Usuario";
CREATE FUNCTION competitive_membership_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."institucionId" IS DISTINCT FROM OLD."institucionId" THEN
    INSERT INTO "HistorialInstitucionCompetitiva" ("usuarioId","institucionId",desde)
    VALUES (NEW.id,NEW."institucionId",clock_timestamp());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER competitive_membership_history AFTER INSERT OR UPDATE OF "institucionId" ON "Usuario"
FOR EACH ROW EXECUTE FUNCTION competitive_membership_history();

CREATE FUNCTION competitive_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Competitive audit rows are append-only' USING ERRCODE = '23514'; END $$;
CREATE TRIGGER competitive_ledger_immutable BEFORE UPDATE OR DELETE ON "EventoXpCompetitivo" FOR EACH ROW EXECUTE FUNCTION competitive_append_only();
CREATE TRIGGER competitive_membership_immutable BEFORE UPDATE OR DELETE ON "HistorialInstitucionCompetitiva" FOR EACH ROW EXECUTE FUNCTION competitive_append_only();
CREATE TRIGGER competitive_ledger_no_truncate BEFORE TRUNCATE ON "EventoXpCompetitivo" FOR EACH STATEMENT EXECUTE FUNCTION competitive_append_only();
CREATE TRIGGER competitive_membership_no_truncate BEFORE TRUNCATE ON "HistorialInstitucionCompetitiva" FOR EACH STATEMENT EXECUTE FUNCTION competitive_append_only();
ALTER TABLE "EventoXpCompetitivo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BalanceCompetitivo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HistorialInstitucionCompetitiva" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "EventoXpCompetitivo", "BalanceCompetitivo", "HistorialInstitucionCompetitiva" FROM PUBLIC;
REVOKE ALL ON SEQUENCE "HistorialInstitucionCompetitiva_id_seq" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON "EventoXpCompetitivo", "BalanceCompetitivo", "HistorialInstitucionCompetitiva" FROM %I',r);
      EXECUTE format('REVOKE ALL ON SEQUENCE "HistorialInstitucionCompetitiva_id_seq" FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMIT;
