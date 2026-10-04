BEGIN;
CREATE TYPE "ModalidadTriviaRush" AS ENUM ('TRIVIA_RUSH', 'GHOST_DUEL');
ALTER TABLE "IntentoTriviaRush"
  ADD COLUMN "evidenciaVersion" integer,
  ADD COLUMN modalidad "ModalidadTriviaRush",
  ADD COLUMN "snapshotInicial" jsonb;

CREATE FUNCTION trivia_snapshot_valid(s jsonb, mode text, areas jsonb, duration integer, rules integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE q integer; entry jsonb; question jsonb; n integer := 0; seen text[] := '{}'; options text[]; ordered text[];
BEGIN
  IF s IS NULL OR jsonb_typeof(s) <> 'object' THEN RETURN false; END IF;
  q := (s->>'q')::integer;
  IF q IS NULL OR q NOT BETWEEN 10 AND 30 OR s->>'version' IS DISTINCT FROM '1'
    OR s->'config'->>'modalidad' IS DISTINCT FROM mode
    OR s->'config'->'areas' IS DISTINCT FROM areas
    OR s->'config'->>'duracionSegundos' IS DISTINCT FROM duration::text
    OR s->'config'->>'versionReglas' IS DISTINCT FROM rules::text
    OR jsonb_typeof(s->'questions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(s->'questions') <> q OR NOT (s ? 'ghost') THEN RETURN false; END IF;
  IF mode = 'TRIVIA_RUSH' AND s->'ghost' <> 'null'::jsonb THEN RETURN false; END IF;
  IF s->'ghost' <> 'null'::jsonb AND (jsonb_typeof(s->'ghost') <> 'object'
    OR s->'ghost'->>'q' IS DISTINCT FROM q::text) THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(s->'questions') LOOP
    question := entry->'pregunta';
    IF entry->>'orden' IS DISTINCT FROM n::text OR nullif(entry->>'preguntaId','') IS NULL
      OR entry->>'preguntaId' = ANY(seen) OR question->>'id' IS DISTINCT FROM entry->>'preguntaId'
      OR nullif(question->>'enunciado','') IS NULL
      OR jsonb_typeof(question->'respuestas') IS DISTINCT FROM 'array'
      OR jsonb_array_length(question->'respuestas') <> 4
      OR (SELECT count(*) FROM jsonb_array_elements(question->'respuestas') r WHERE r->'esCorrecta' = 'true'::jsonb) <> 1
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(question->'respuestas') r WHERE nullif(r->>'id','') IS NULL OR nullif(r->>'texto','') IS NULL OR jsonb_typeof(r->'esCorrecta') IS DISTINCT FROM 'boolean')
      OR jsonb_typeof(entry->'opcionesOrden') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
    SELECT array_agg(r->>'id' ORDER BY r->>'id') INTO options FROM jsonb_array_elements(question->'respuestas') r;
    SELECT array_agg(value ORDER BY value) INTO ordered FROM jsonb_array_elements_text(entry->'opcionesOrden');
    IF options IS DISTINCT FROM ordered OR (SELECT count(DISTINCT x) FROM unnest(options) x) <> 4 THEN RETURN false; END IF;
    seen := array_append(seen, entry->>'preguntaId'); n := n + 1;
  END LOOP;
  RETURN true;
END $$;
ALTER TABLE "IntentoTriviaRush" ADD CONSTRAINT trivia_evidence_context CHECK (
  ("evidenciaVersion" IS NULL AND modalidad IS NULL AND "snapshotInicial" IS NULL) OR
  ("evidenciaVersion" IS NOT NULL AND "evidenciaVersion" = 1 AND modalidad IS NOT NULL AND "snapshotInicial" IS NOT NULL
    AND "versionReglas" = 1 AND "duracionBaseSegundos" IN (60,90,120) AND "tiempoExtraSegundos" >= 0
    AND trivia_snapshot_valid("snapshotInicial", modalidad::text, to_jsonb(areas), "duracionBaseSegundos", "versionReglas")
    AND "venceEn" = "iniciadoEn" + ("duracionBaseSegundos" + "tiempoExtraSegundos") * interval '1 second'
    AND ((estado = 'ACTIVO' AND "finalizadoEn" IS NULL) OR (estado <> 'ACTIVO' AND "finalizadoEn" BETWEEN "iniciadoEn" AND "venceEn" AND "finalizadoEn" IS NOT NULL))
    AND (estado <> 'EXPIRADO' OR "finalizadoEn" = "venceEn"))
);

CREATE FUNCTION trivia_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ghost jsonb; prior "IntentoTriviaRush"; checkpoints jsonb; expected_ghost jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."evidenciaVersion" IS NOT NULL THEN RAISE EXCEPTION 'Trivia evidence must be retained' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."evidenciaVersion" IS NOT NULL THEN
      IF NEW.estado <> 'ACTIVO' OR NEW.puntaje <> 0 OR NEW."indiceActual" <> 0 OR NEW."respuestasCorrectas" <> 0
        OR NEW."respuestasIncorrectas" <> 0 OR NEW."preguntasSaltadas" <> 0 OR NEW."comboActual" <> 0 OR NEW."mejorCombo" <> 0 OR NEW.asistido
        OR NEW."tiempoExtraSegundos" <> 0 THEN RAISE EXCEPTION 'Trivia evidence must start empty' USING ERRCODE = '23514'; END IF;
      ghost := NEW."snapshotInicial"->'ghost';
      IF ghost <> 'null'::jsonb THEN
        SELECT * INTO prior FROM "IntentoTriviaRush" WHERE id = (ghost->>'intentoId')::uuid;
        IF prior.id IS NULL OR prior."usuarioId" <> NEW."usuarioId" OR prior."evidenciaVersion" IS DISTINCT FROM 1
          OR prior.estado NOT IN ('FINALIZADO','EXPIRADO') OR prior.asistido
          OR prior.areas <> NEW.areas OR prior."duracionBaseSegundos" <> NEW."duracionBaseSegundos"
          OR prior."versionReglas" <> NEW."versionReglas" OR prior."snapshotInicial"->'q' IS DISTINCT FROM NEW."snapshotInicial"->'q'
          OR ghost->>'puntaje' IS DISTINCT FROM prior.puntaje::text
          OR ghost->>'respuestasCorrectas' IS DISTINCT FROM prior."respuestasCorrectas"::text
          OR ghost->>'mejorCombo' IS DISTINCT FROM prior."mejorCombo"::text
          OR ghost->'config' IS DISTINCT FROM prior."snapshotInicial"->'config'
          THEN RAISE EXCEPTION 'Invalid fixed ghost reference' USING ERRCODE = '23514'; END IF;
        -- Same deterministic ordering as the service: original question order,
        -- then answer number. Preserve separate checkpoints even within one second.
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'segundosTranscurridos', elapsed, 'puntaje', score
        ) ORDER BY question_order, answer_number), '[]'::jsonb) INTO checkpoints
        FROM (
          SELECT (q.value->>'orden')::integer AS question_order,
            r."numeroIntento" AS answer_number,
            least(prior."duracionBaseSegundos", greatest(0,
              floor(extract(epoch FROM (date_trunc('milliseconds', r."respondidaEn")
                - date_trunc('milliseconds', prior."iniciadoEn"))))::integer)) AS elapsed,
            sum(r."puntosOtorgados") OVER (
              ORDER BY (q.value->>'orden')::integer, r."numeroIntento"
              ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS score
          FROM "TriviaRushRespuesta" r
          JOIN jsonb_array_elements(prior."snapshotInicial"->'questions') q
            ON q.value->>'preguntaId' = r."preguntaId"
          WHERE r."intentoId" = prior.id AND r."esFinal"
        ) evidence;
        expected_ghost := jsonb_build_object(
          'intentoId', prior.id, 'puntaje', prior.puntaje,
          'respuestasCorrectas', prior."respuestasCorrectas", 'mejorCombo', prior."mejorCombo",
          'finalizadoEn', to_char(prior."finalizadoEn", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'q', prior."snapshotInicial"->'q', 'config', prior."snapshotInicial"->'config',
          'checkpoints', checkpoints);
        -- Canonical UTC milliseconds match Prisma Date / Date.toISOString;
        -- database Timestamp(6) values are read at millisecond precision by JS.
        -- Exact JSON equality also rejects extra fields (including private solutions).
        IF ghost IS DISTINCT FROM expected_ghost THEN
          RAISE EXCEPTION 'Fixed ghost differs from original terminal evidence' USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."evidenciaVersion" IS DISTINCT FROM OLD."evidenciaVersion" OR NEW.modalidad IS DISTINCT FROM OLD.modalidad OR NEW."snapshotInicial" IS DISTINCT FROM OLD."snapshotInicial" THEN
    RAISE EXCEPTION 'Trivia origin and snapshot are immutable; no historical enrollment' USING ERRCODE = '23514';
  END IF;
  IF OLD."evidenciaVersion" IS NULL THEN RETURN NEW; END IF;
  IF OLD.estado <> 'ACTIVO' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Trivia terminal is immutable' USING ERRCODE = '23514'; END IF;
  IF NEW."usuarioId" <> OLD."usuarioId" OR NEW.id <> OLD.id OR NEW.areas <> OLD.areas OR NEW."duracionBaseSegundos" <> OLD."duracionBaseSegundos" OR NEW."iniciadoEn" <> OLD."iniciadoEn" OR NEW."versionReglas" <> OLD."versionReglas" THEN
    RAISE EXCEPTION 'Trivia configuration is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trivia_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON "IntentoTriviaRush" FOR EACH ROW EXECUTE FUNCTION trivia_evidence_guard();

CREATE FUNCTION trivia_child_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt "IntentoTriviaRush"; entry jsonb; option jsonb;
BEGIN
  SELECT * INTO attempt FROM "IntentoTriviaRush" WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."intentoId" ELSE NEW."intentoId" END FOR UPDATE;
  IF TG_OP = 'UPDATE' AND NEW."intentoId" IS DISTINCT FROM OLD."intentoId" THEN RAISE EXCEPTION 'Cannot move Trivia evidence' USING ERRCODE = '23514'; END IF;
  IF attempt."evidenciaVersion" IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' OR attempt.estado <> 'ACTIVO' THEN RAISE EXCEPTION 'Trivia evidence is append-only before terminal' USING ERRCODE = '23514'; END IF;
  SELECT value INTO entry FROM jsonb_array_elements(attempt."snapshotInicial"->'questions') WHERE value->>'preguntaId' = NEW."preguntaId";
  IF entry IS NULL THEN RAISE EXCEPTION 'Question outside snapshot' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'TriviaRushPregunta' THEN
    IF NEW.orden::text IS DISTINCT FROM entry->>'orden' OR NEW."opcionesOrden" IS DISTINCT FROM entry->'opcionesOrden' THEN RAISE EXCEPTION 'Question order outside snapshot' USING ERRCODE = '23514'; END IF;
  ELSIF TG_TABLE_NAME = 'TriviaRushRespuesta' THEN
    IF NEW."respondidaEn" < attempt."iniciadoEn" OR NEW."respondidaEn" >= attempt."venceEn" THEN RAISE EXCEPTION 'Answer outside time window' USING ERRCODE = '23514'; END IF;
    IF NEW."respuestaSeleccionadaId" IS NOT NULL THEN
      SELECT value INTO option FROM jsonb_array_elements(entry->'pregunta'->'respuestas') WHERE value->>'id' = NEW."respuestaSeleccionadaId";
      IF option IS NULL OR NEW."esCorrecta" IS DISTINCT FROM (option->>'esCorrecta')::boolean THEN RAISE EXCEPTION 'Answer outside original solution' USING ERRCODE = '23514'; END IF;
    ELSIF NEW."esCorrecta" THEN RAISE EXCEPTION 'Skipped question cannot be correct' USING ERRCODE = '23514'; END IF;
  ELSE
    IF attempt.modalidad = 'GHOST_DUEL' THEN RAISE EXCEPTION 'Ghost mode does not allow boosters' USING ERRCODE = '23514'; END IF;
    IF NEW."activadoEn" < attempt."iniciadoEn" OR NEW."activadoEn" >= attempt."venceEn" THEN RAISE EXCEPTION 'Booster outside time window' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trivia_child_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON "TriviaRushPregunta" FOR EACH ROW EXECUTE FUNCTION trivia_child_evidence_guard();
CREATE TRIGGER trivia_child_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON "TriviaRushRespuesta" FOR EACH ROW EXECUTE FUNCTION trivia_child_evidence_guard();
CREATE TRIGGER trivia_child_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON "TriviaRushPotenciador" FOR EACH ROW EXECUTE FUNCTION trivia_child_evidence_guard();
-- Private snapshots, including the correct answers, must never be client-readable via SQL/API.
ALTER TABLE "IntentoTriviaRush" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TriviaRushPregunta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TriviaRushRespuesta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TriviaRushPotenciador" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "IntentoTriviaRush", "TriviaRushPregunta", "TriviaRushRespuesta", "TriviaRushPotenciador" FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON "IntentoTriviaRush", "TriviaRushPregunta", "TriviaRushRespuesta", "TriviaRushPotenciador" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
