BEGIN;
-- Negative provenance only: these are known UUIDs, NOT historical admissions.
-- Retained without a parent FK so allowed legacy deletion cannot reset identity.
LOCK TABLE "PartidaTiraAfloja" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE "TugMatchIdentity" (id uuid PRIMARY KEY);
INSERT INTO "TugMatchIdentity" SELECT id FROM "PartidaTiraAfloja";
CREATE TRIGGER tug_identity_immutable BEFORE UPDATE OR DELETE ON "TugMatchIdentity"
  FOR EACH ROW EXECUTE FUNCTION competitive_append_only();
CREATE TRIGGER tug_identity_no_truncate BEFORE TRUNCATE ON "TugMatchIdentity"
  FOR EACH STATEMENT EXECUTE FUNCTION competitive_append_only();
ALTER TABLE "TugMatchIdentity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TugMatchIdentity" FROM PUBLIC;
-- NULL historical rows are not admissions, including prepared/certified V1.
ALTER TABLE "PartidaTiraAfloja"
  ADD COLUMN "competitiveAdmissionVersion" integer,
  ADD COLUMN "competitiveRulesVersion" integer,
  ADD COLUMN "competitivePolicy" jsonb,
  ADD COLUMN "competitiveAdmissionAt" timestamp(6),
  ADD COLUMN "competitiveOriginalAId" uuid,
  ADD COLUMN "competitiveOriginalBId" uuid;

ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT tug_admission_shape CHECK (
  ("competitiveAdmissionVersion" IS NULL AND "competitiveRulesVersion" IS NULL
    AND "competitivePolicy" IS NULL AND "competitiveAdmissionAt" IS NULL
    AND "competitiveOriginalAId" IS NULL AND "competitiveOriginalBId" IS NULL)
  OR
  ("competitiveAdmissionVersion" IS NOT DISTINCT FROM 1
    AND "competitiveAdmissionAt" IS NOT NULL AND "competitiveOriginalAId" IS NOT NULL
    AND "competitiveOriginalAId" IS NOT DISTINCT FROM "jugadorAId"
    AND "competitiveOriginalBId" IS NOT DISTINCT FROM "jugadorBId"
    AND (("competitiveRulesVersion" IS NULL AND "competitivePolicy" IS NOT DISTINCT FROM
      '{"policyVersion":1,"flag":"COMPETITIVE_TUG_ENABLED","enabled":false}'::jsonb)
      OR ("competitiveRulesVersion" IS NOT DISTINCT FROM 1 AND "competitivePolicy" IS NOT DISTINCT FROM
      '{"policyVersion":1,"flag":"COMPETITIVE_TUG_ENABLED","enabled":true}'::jsonb)))
);

CREATE FUNCTION tug_admission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO "TugMatchIdentity" VALUES(NEW.id) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TUG_ADMISSION_ID_REUSED' USING ERRCODE='23514';
    END IF;
    IF NEW."competitiveAdmissionVersion" IS NOT NULL THEN
      IF NEW.estado<>'BUSCANDO' OR NEW."jugadorBId" IS NOT NULL OR NEW."rondaActual"<>0
        OR NEW."competitiveOriginalAId" IS NOT NULL OR NEW."competitiveOriginalBId" IS NOT NULL
        OR NEW."competitiveAdmissionAt" IS NOT NULL
        THEN RAISE EXCEPTION 'TUG_ADMISSION_INVALID_ORIGIN' USING ERRCODE='23514'; END IF;
      IF NEW."competitiveRulesVersion" IS NOT NULL AND
        (NOT NEW."prepararEvidencia" OR NEW."presenciaVersion" IS DISTINCT FROM 1
          OR NEW."certificacionRVersion" IS DISTINCT FROM 1 OR NEW."versionReglas"<>1
          OR NOT EXISTS(SELECT 1 FROM "Usuario" WHERE id=NEW."jugadorAId" AND rol='ESTUDIANTE' AND "correoVerificado"))
        THEN RAISE EXCEPTION 'TUG_ADMISSION_INELIGIBLE' USING ERRCODE='23514'; END IF;
      NEW."competitiveOriginalAId" := NEW."jugadorAId";
      NEW."competitiveAdmissionAt" := timezone('UTC',clock_timestamp());
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD."competitiveAdmissionVersion" IS NOT NULL THEN
      RAISE EXCEPTION 'TUG_ADMISSION_RETAINED' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF ROW(NEW."competitiveAdmissionVersion",NEW."competitiveRulesVersion",NEW."competitivePolicy",NEW."competitiveAdmissionAt",NEW."competitiveOriginalAId")
    IS DISTINCT FROM ROW(OLD."competitiveAdmissionVersion",OLD."competitiveRulesVersion",OLD."competitivePolicy",OLD."competitiveAdmissionAt",OLD."competitiveOriginalAId")
    THEN RAISE EXCEPTION 'TUG_ADMISSION_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF OLD."competitiveAdmissionVersion" IS NULL THEN
    IF NEW."competitiveOriginalBId" IS DISTINCT FROM OLD."competitiveOriginalBId" THEN
      RAISE EXCEPTION 'TUG_ADMISSION_IMMUTABLE' USING ERRCODE='23514'; END IF;
    -- Preserve otherwise legal legacy renaming, but retain both known UUIDs.
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      INSERT INTO "TugMatchIdentity" VALUES(NEW.id) ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TUG_ADMISSION_ID_REUSED' USING ERRCODE='23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."jugadorAId" IS DISTINCT FROM OLD."jugadorAId" OR NEW.area IS DISTINCT FROM OLD.area
    OR NEW."versionReglas" IS DISTINCT FROM OLD."versionReglas"
    THEN RAISE EXCEPTION 'TUG_ADMISSION_CONTEXT_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW."competitiveOriginalBId" IS DISTINCT FROM OLD."competitiveOriginalBId" THEN
    RAISE EXCEPTION 'TUG_ADMISSION_PARTICIPANTS_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF NEW."jugadorBId" IS DISTINCT FROM OLD."jugadorBId" THEN
    IF OLD."jugadorBId" IS NOT NULL OR NEW."jugadorBId" IS NULL OR OLD.estado<>'BUSCANDO'
      OR NEW.estado<>'PREPARANDO' OR NEW."jugadorBId"=OLD."jugadorAId"
      THEN RAISE EXCEPTION 'TUG_ADMISSION_PARTICIPANTS_IMMUTABLE' USING ERRCODE='23514'; END IF;
    IF OLD."competitiveRulesVersion"=1 AND
      (SELECT count(*) FROM "Usuario" WHERE id IN (NEW."jugadorAId",NEW."jugadorBId") AND rol='ESTUDIANTE' AND "correoVerificado")<>2
      THEN RAISE EXCEPTION 'TUG_ADMISSION_INELIGIBLE' USING ERRCODE='23514'; END IF;
    NEW."competitiveOriginalBId" := NEW."jugadorBId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tug_admission_origin BEFORE INSERT OR UPDATE OR DELETE ON "PartidaTiraAfloja"
  FOR EACH ROW EXECUTE FUNCTION tug_admission_guard();
-- No new public API or function privileges; database owner remains a trusted writer.
REVOKE ALL ON FUNCTION tug_admission_guard() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON "TugMatchIdentity" FROM %I',r);
      EXECUTE format('REVOKE ALL ON FUNCTION tug_admission_guard() FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMIT;
