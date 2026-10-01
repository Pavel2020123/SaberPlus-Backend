BEGIN;
-- Existing attempts remain noncompetitive (NULL). No historical reward backfill.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['IntentoCima','IntentoGuardian','IntentoRescateEstrellas'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN "competitiveRulesVersion" integer,
      ADD COLUMN "competitiveSettledAt" timestamptz(3),
      ADD COLUMN "competitiveRetryAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP', t);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT competitive_solo_context CHECK (
      ("competitiveRulesVersion" IS NULL AND "competitiveSettledAt" IS NULL) OR
      ("competitiveRulesVersion" IS NOT NULL AND "competitiveRulesVersion" = 1 AND version = 1 AND "venceEn" = "creadoEn" + interval ''24 hours''
        AND ((estado = ''ACTIVO'' AND "finalizadoEn" IS NULL AND "competitiveSettledAt" IS NULL)
          OR (estado IN (''VICTORIA'',''DERROTA'',''AGOTADO'',''ABANDONADO'',''EXPIRADO'')
            AND "finalizadoEn" IS NOT NULL AND "finalizadoEn" BETWEEN "creadoEn" AND "venceEn"))
        AND (estado <> ''EXPIRADO'' OR "finalizadoEn" = "venceEn")))', t);
    EXECUTE format('CREATE INDEX %I ON %I ("competitiveRulesVersion", "competitiveSettledAt", "competitiveRetryAt")', t || '_competitive_pending_idx', t);
  END LOOP;
END $$;

CREATE FUNCTION competitive_solo_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."competitiveRulesVersion" IS NOT NULL THEN
      RAISE EXCEPTION 'Competitive evidence must be retained' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."competitiveRulesVersion" IS NOT NULL AND (NEW.estado <> 'ACTIVO' OR NEW.respuestas <> '[]'::jsonb OR NEW."competitiveSettledAt" IS NOT NULL) THEN
      RAISE EXCEPTION 'Competitive attempts must start online and active' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."competitiveRulesVersion" IS DISTINCT FROM OLD."competitiveRulesVersion" THEN
    RAISE EXCEPTION 'Competitive origin is immutable; no retroactive enrollment' USING ERRCODE = '23514';
  END IF;
  IF OLD."competitiveRulesVersion" IS NULL THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - ARRAY['estado','respuestas','finalizadoEn','competitiveSettledAt','competitiveRetryAt']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['estado','respuestas','finalizadoEn','competitiveSettledAt','competitiveRetryAt']) THEN
    RAISE EXCEPTION 'Competitive snapshot and configuration are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.estado <> 'ACTIVO' AND (NEW.estado IS DISTINCT FROM OLD.estado OR NEW.respuestas IS DISTINCT FROM OLD.respuestas OR NEW."finalizadoEn" IS DISTINCT FROM OLD."finalizadoEn") THEN
    RAISE EXCEPTION 'Competitive terminal evidence is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.respuestas IS DISTINCT FROM OLD.respuestas AND
    (jsonb_typeof(NEW.respuestas) <> 'array' OR jsonb_array_length(NEW.respuestas) <> jsonb_array_length(OLD.respuestas) + 1
      OR NEW.respuestas - (jsonb_array_length(NEW.respuestas)-1) <> OLD.respuestas) THEN
    RAISE EXCEPTION 'Competitive answers are append-only' USING ERRCODE = '23514';
  END IF;
  IF OLD."competitiveSettledAt" IS NOT NULL AND NEW."competitiveSettledAt" IS DISTINCT FROM OLD."competitiveSettledAt" THEN
    RAISE EXCEPTION 'Settlement acknowledgement is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW."competitiveSettledAt" IS NOT NULL AND OLD."competitiveSettledAt" IS NULL AND NOT EXISTS (
    SELECT 1 FROM "EventoXpCompetitivo" WHERE "sourceType" = TG_ARGV[0]::"FuenteXpCompetitivo"
      AND "sourceId" = NEW.id::text AND "usuarioId" = NEW."usuarioId" AND liquidacion = 'SETTLEMENT'
  ) THEN
    RAISE EXCEPTION 'Cannot acknowledge settlement without ledger event' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER competitive_solo_guard BEFORE INSERT OR UPDATE OR DELETE ON "IntentoCima" FOR EACH ROW EXECUTE FUNCTION competitive_solo_guard('SUMMIT_ATTEMPT');
CREATE TRIGGER competitive_solo_guard BEFORE INSERT OR UPDATE OR DELETE ON "IntentoGuardian" FOR EACH ROW EXECUTE FUNCTION competitive_solo_guard('GUARDIAN_ATTEMPT');
CREATE TRIGGER competitive_solo_guard BEFORE INSERT OR UPDATE OR DELETE ON "IntentoRescateEstrellas" FOR EACH ROW EXECUTE FUNCTION competitive_solo_guard('STAR_RESCUE_ATTEMPT');
-- Existing private RLS is retained. Guardian was not yet covered by that migration.
ALTER TABLE "IntentoGuardian" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "IntentoCima", "IntentoGuardian", "IntentoRescateEstrellas" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON "IntentoCima", "IntentoGuardian", "IntentoRescateEstrellas" FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMIT;
