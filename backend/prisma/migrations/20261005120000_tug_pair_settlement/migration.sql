BEGIN;
-- Preserve original effective microseconds. Existing millisecond values are unchanged.
ALTER TABLE "EventoXpCompetitivo" ALTER COLUMN "fechaEfectiva" TYPE timestamptz(6);
CREATE FUNCTION competitive_timestamp_us(t bigint) RETURNS timestamptz
LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT timestamptz '1970-01-01 00:00:00+00'
   + ((t / 1000000)::text || ' seconds')::interval
   + ((t % 1000000)::text || ' microseconds')::interval
$$;
CREATE TABLE "TugCompetitiveSettlement" (
 "sourceId" uuid PRIMARY KEY REFERENCES "TugMatchIdentity"(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SETTLED','RESOLVED','INVALID')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 "retryAt" timestamptz NOT NULL DEFAULT clock_timestamp(),
 "lastError" text,
 "terminalUs" bigint,
 "evidenceHash" varchar(64),
 decision jsonb,
 "resolvedAt" timestamptz,
 CHECK ((state IN ('SETTLED','RESOLVED') AND "terminalUs" IS NOT NULL
   AND "evidenceHash" ~ '^[a-f0-9]{64}$' AND decision IS NOT NULL AND "resolvedAt" IS NOT NULL)
   OR (state IN ('PENDING','INVALID') AND "terminalUs" IS NULL
    AND "evidenceHash" IS NULL AND decision IS NULL AND "resolvedAt" IS NULL))
);
CREATE INDEX tug_settlement_pending ON "TugCompetitiveSettlement" ("retryAt","sourceId") WHERE state='PENDING';
CREATE FUNCTION tug_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (NEW."sourceId"<>OLD."sourceId"
   OR OLD.state IN ('SETTLED','RESOLVED'))) THEN
   RAISE EXCEPTION 'TUG_SETTLEMENT_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM "PartidaTiraAfloja" m WHERE m.id=NEW."sourceId"
  AND m."competitiveRulesVersion"=1 AND m."competitiveAdmissionVersion"=1
  AND m."temporalVersion"=1 AND m.estado NOT IN ('BUSCANDO','PREPARANDO','ACTIVA')) THEN
  RAISE EXCEPTION 'TUG_SETTLEMENT_ORIGIN_INELIGIBLE' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tug_settlement_guard BEFORE INSERT OR UPDATE OR DELETE ON "TugCompetitiveSettlement"
 FOR EACH ROW EXECUTE FUNCTION tug_settlement_guard();
CREATE TRIGGER tug_settlement_no_truncate BEFORE TRUNCATE ON "TugCompetitiveSettlement"
 FOR EACH STATEMENT EXECUTE FUNCTION competitive_append_only();
ALTER TABLE "TugCompetitiveSettlement" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TugCompetitiveSettlement" FROM PUBLIC;
REVOKE ALL ON FUNCTION competitive_timestamp_us(bigint),tug_settlement_guard() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON "TugCompetitiveSettlement" FROM %I',r);
   EXECUTE format('REVOKE ALL ON FUNCTION competitive_timestamp_us(bigint),tug_settlement_guard() FROM %I',r);
  END IF;
 END LOOP;
END $$;
COMMIT;
