BEGIN;
-- New matches only. NULL historical enrollments/rows are never backfilled.
ALTER TABLE "PartidaTiraAfloja" ADD COLUMN "certificacionRVersion" integer;
ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT tug_visibility_enrollment CHECK
  ("certificacionRVersion" IS NULL OR
   ("certificacionRVersion"=1 AND "prepararEvidencia" AND "presenciaVersion" IS NOT DISTINCT FROM 1));
CREATE FUNCTION tug_visibility_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW."certificacionRVersion" IS DISTINCT FROM OLD."certificacionRVersion" THEN
    RAISE EXCEPTION 'No retroactive Tug visibility enrollment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tug_visibility_origin BEFORE INSERT OR UPDATE ON "PartidaTiraAfloja"
FOR EACH ROW EXECUTE FUNCTION tug_visibility_origin_guard();

ALTER TABLE "TiraAflojaRondaPresentada" ADD COLUMN "origenXid" text, ADD COLUMN "origenPid" integer;
CREATE FUNCTION tug_presented_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- The existing evidence guard has validated and locked this parent first.
  IF (SELECT "certificacionRVersion" FROM "PartidaTiraAfloja" WHERE id=NEW."partidaId")=1 THEN
    NEW."origenXid" := pg_current_xact_id()::text; -- top-level, including savepoints
    NEW."origenPid" := pg_backend_pid();
  ELSE
    NEW."origenXid" := NULL; NEW."origenPid" := NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tug_presented_origin BEFORE INSERT ON "TiraAflojaRondaPresentada"
FOR EACH ROW EXECUTE FUNCTION tug_presented_origin_guard();

-- A pair certificate proves a committed source was actually observed by a
-- different backend before the frozen deadline. NOT a timestamp of COMMIT.
CREATE TABLE "TugRoundVisibility" (
  "partidaId" uuid NOT NULL REFERENCES "PartidaTiraAfloja"(id) ON DELETE RESTRICT,
  ronda integer NOT NULL CHECK (ronda BETWEEN 1 AND 20),
  "origenXid" text NOT NULL, "origenPid" integer NOT NULL,
  "testigoXid" text NOT NULL, "testigoPid" integer NOT NULL,
  "observadaEn" timestamp(6) NOT NULL, "limiteEn" timestamp(6) NOT NULL,
  PRIMARY KEY ("partidaId",ronda),
  CHECK ("observadaEn" < "limiteEn" AND "origenXid" <> "testigoXid" AND "origenPid" <> "testigoPid")
);
CREATE FUNCTION tug_visibility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "PartidaTiraAfloja"; rows_count integer; r "TiraAflojaRondaPresentada"; t timestamp;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Tug visibility is append only' USING ERRCODE='23514'; END IF;
  PERFORM tug_presence_lock(NEW."partidaId"); -- sorted Usuario -> advisory/parent
  SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=NEW."partidaId";
  SELECT count(*) INTO rows_count FROM "TiraAflojaRondaPresentada"
    WHERE "partidaId"=m.id AND ronda=NEW.ronda;
  SELECT * INTO r FROM "TiraAflojaRondaPresentada"
    WHERE "partidaId"=m.id AND ronda=NEW.ronda AND "usuarioId"=m."jugadorAId";
  IF m."certificacionRVersion" IS DISTINCT FROM 1 OR m."evidenciaVersion" IS DISTINCT FROM 1 OR rows_count<>2
    OR r."origenXid" IS NULL OR r."origenPid" IS NULL
    OR r."origenPid"=pg_backend_pid() OR r."origenXid"=pg_current_xact_id()::text
    OR pg_xact_status(r."origenXid"::xid8) IS DISTINCT FROM 'committed'
    OR NOT EXISTS (SELECT 1 FROM "TiraAflojaRondaPresentada" b
      WHERE b."partidaId"=m.id AND b.ronda=NEW.ronda AND b."usuarioId"=m."jugadorBId"
      AND ROW(b."origenXid",b."origenPid",b."preguntaId",b."programadaEn",b."venceEn")
        IS NOT DISTINCT FROM ROW(r."origenXid",r."origenPid",r."preguntaId",r."programadaEn",r."venceEn"))
    THEN RAISE EXCEPTION 'Tug visibility requires a committed original pair on another backend' USING ERRCODE='23514'; END IF;
  t := timezone('UTC',clock_timestamp()); -- AFTER all waits, reads and status checks
  IF t>=least(r."venceEn",m."expiraEn") THEN
    RAISE EXCEPTION 'Tug visibility observation exceeds deadline' USING ERRCODE='PT001';
  END IF;
  -- Caller-supplied evidence is never trusted, even via direct INSERT.
  NEW."origenXid":=r."origenXid"; NEW."origenPid":=r."origenPid";
  NEW."testigoXid":=pg_current_xact_id()::text; NEW."testigoPid":=pg_backend_pid();
  NEW."observadaEn":=t; NEW."limiteEn":=least(r."venceEn",m."expiraEn");
  RETURN NEW;
END $$;
CREATE TRIGGER tug_visibility_evidence BEFORE INSERT OR UPDATE OR DELETE ON "TugRoundVisibility"
FOR EACH ROW EXECUTE FUNCTION tug_visibility_guard();

CREATE FUNCTION tug_certify_presented_round(match_id uuid, round_number integer) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE m "PartidaTiraAfloja"; r "TiraAflojaRondaPresentada";
BEGIN
  PERFORM tug_presence_lock(match_id);
  -- Exact retry returns the existing immutable observation, never mints one late.
  IF EXISTS (SELECT 1 FROM "TugRoundVisibility" WHERE "partidaId"=match_id AND ronda=round_number) THEN RETURN true; END IF;
  SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=match_id;
  SELECT * INTO r FROM "TiraAflojaRondaPresentada"
    WHERE "partidaId"=match_id AND ronda=round_number AND "usuarioId"=m."jugadorAId";
  IF m."certificacionRVersion" IS DISTINCT FROM 1 OR r."origenXid" IS NULL
    OR r."origenPid"=pg_backend_pid() OR r."origenXid"=pg_current_xact_id()::text
    OR pg_xact_status(r."origenXid"::xid8) IS DISTINCT FROM 'committed'
    OR timezone('UTC',clock_timestamp())>=least(r."venceEn",m."expiraEn") THEN RETURN false; END IF;
  INSERT INTO "TugRoundVisibility"("partidaId",ronda,"origenXid","origenPid","testigoXid","testigoPid","observadaEn","limiteEn")
    VALUES(match_id,round_number,'guard',0,'guard',0,timezone('UTC',clock_timestamp()),timezone('UTC',clock_timestamp()));
  RETURN true;
END $$;

ALTER TABLE "TugRoundVisibility" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TugRoundVisibility" FROM PUBLIC;
REVOKE ALL ON FUNCTION tug_visibility_origin_guard(),tug_presented_origin_guard(),tug_visibility_guard(),tug_certify_presented_round(uuid,integer) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "TugRoundVisibility" FROM anon;
    REVOKE ALL ON FUNCTION tug_visibility_origin_guard(),tug_presented_origin_guard(),tug_visibility_guard(),tug_certify_presented_round(uuid,integer) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "TugRoundVisibility" FROM authenticated;
    REVOKE ALL ON FUNCTION tug_visibility_origin_guard(),tug_presented_origin_guard(),tug_visibility_guard(),tug_certify_presented_round(uuid,integer) FROM authenticated;
  END IF;
END $$;
COMMIT;
