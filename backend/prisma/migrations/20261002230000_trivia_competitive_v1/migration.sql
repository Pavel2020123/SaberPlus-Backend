BEGIN;
ALTER TABLE "IntentoTriviaRush"
 ADD COLUMN "competitiveRulesVersion" integer,
 ADD COLUMN "competitiveAdmittedAt" timestamp(3),
 ADD COLUMN "competitiveSettledAt" timestamp(3),
 ADD COLUMN "competitiveRetryAt" timestamp(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp());
ALTER TABLE "IntentoTriviaRush" ADD CONSTRAINT trivia_competitive_origin CHECK (
 ("competitiveRulesVersion" IS NULL AND "competitiveAdmittedAt" IS NULL AND "competitiveSettledAt" IS NULL) OR
 ("competitiveRulesVersion" = 1 AND "competitiveRulesVersion" IS NOT NULL AND "competitiveAdmittedAt" IS NOT NULL
 AND "competitiveAdmittedAt" = "iniciadoEn" AND "evidenciaVersion" IS NOT NULL AND "evidenciaVersion" = 1 AND "presenciaVersion" IS NOT NULL AND "presenciaVersion" = 1
 AND modalidad IS NOT NULL AND "snapshotInicial" IS NOT NULL
 AND ("competitiveSettledAt" IS NULL OR estado <> 'ACTIVO')));
CREATE INDEX trivia_competitive_pending ON "IntentoTriviaRush" ("competitiveRetryAt",id)
 WHERE "competitiveRulesVersion"=1 AND "competitiveSettledAt" IS NULL;
CREATE FUNCTION trivia_competitive_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW."competitiveRulesVersion" IS NOT NULL AND NEW.estado <> 'ACTIVO' THEN
   RAISE EXCEPTION 'Competitive admission must start active' USING ERRCODE='23514';
 END IF;
 IF TG_OP='UPDATE' AND (NEW."competitiveRulesVersion" IS DISTINCT FROM OLD."competitiveRulesVersion"
   OR NEW."competitiveAdmittedAt" IS DISTINCT FROM OLD."competitiveAdmittedAt") THEN
   RAISE EXCEPTION 'Competitive admission is immutable; no retroactive enrollment' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trivia_competitive_origin_guard BEFORE INSERT OR UPDATE ON "IntentoTriviaRush"
 FOR EACH ROW EXECUTE FUNCTION trivia_competitive_origin_guard();
-- Terminal gameplay remains immutable; recovery acknowledgement/backoff is separate.
CREATE OR REPLACE FUNCTION trivia_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
  IF OLD.estado <> 'ACTIVO' AND (to_jsonb(NEW) - ARRAY['competitiveSettledAt','competitiveRetryAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['competitiveSettledAt','competitiveRetryAt']) THEN RAISE EXCEPTION 'Trivia terminal is immutable' USING ERRCODE = '23514'; END IF;
  IF NEW."usuarioId" <> OLD."usuarioId" OR NEW.id <> OLD.id OR NEW.areas <> OLD.areas OR NEW."duracionBaseSegundos" <> OLD."duracionBaseSegundos" OR NEW."iniciadoEn" <> OLD."iniciadoEn" OR NEW."versionReglas" <> OLD."versionReglas" THEN
    RAISE EXCEPTION 'Trivia configuration is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE SEQUENCE trivia_competitive_action_seq;
ALTER TABLE "TriviaRushRespuesta" ADD COLUMN "competitiveActionSeq" bigint UNIQUE;
ALTER TABLE "TriviaRushPotenciador" ADD COLUMN "competitiveActionSeq" bigint UNIQUE, ADD COLUMN "competitiveGrant" jsonb;
CREATE FUNCTION trivia_competitive_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt "IntentoTriviaRush"; grant_row "ConcesionRecompensaJuego";
BEGIN
 PERFORM trivia_presence_lock(NEW."intentoId");
 SELECT * INTO attempt FROM "IntentoTriviaRush" WHERE id=NEW."intentoId";
 IF NEW."competitiveActionSeq" IS NOT NULL THEN RAISE EXCEPTION 'Sequence is server assigned' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='TriviaRushPotenciador' THEN
  IF NEW."competitiveGrant" IS NOT NULL THEN RAISE EXCEPTION 'Grant evidence is server assigned' USING ERRCODE='23514'; END IF;
 END IF;
 IF attempt."competitiveRulesVersion" IS NULL THEN RETURN NEW; END IF;
 NEW."competitiveActionSeq":=nextval('trivia_competitive_action_seq');
 IF TG_TABLE_NAME='TriviaRushPotenciador' THEN
   SELECT * INTO grant_row FROM "ConcesionRecompensaJuego" WHERE id=NEW."concesionId";
   IF grant_row.id IS NULL OR grant_row."usuarioId" <> attempt."usuarioId"
     OR grant_row.estado <> 'CONSUMIDA' OR grant_row."consumidaEn" IS DISTINCT FROM NEW."activadoEn"
     OR grant_row."expiraEn" <= NEW."activadoEn" THEN
     RAISE EXCEPTION 'Invalid competitive grant' USING ERRCODE='23514'; END IF;
   NEW."competitiveGrant":=jsonb_build_object('id',grant_row.id,'usuarioId',grant_row."usuarioId",
      'expiraEn',to_char(grant_row."expiraEn",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trivia_b_competitive_action_guard BEFORE INSERT ON "TriviaRushRespuesta"
 FOR EACH ROW EXECUTE FUNCTION trivia_competitive_action_guard();
CREATE TRIGGER trivia_b_competitive_action_guard BEFORE INSERT ON "TriviaRushPotenciador"
 FOR EACH ROW EXECUTE FUNCTION trivia_competitive_action_guard();
REVOKE ALL ON SEQUENCE trivia_competitive_action_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION trivia_competitive_origin_guard(),trivia_competitive_action_guard() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON SEQUENCE trivia_competitive_action_seq FROM %I',r);
   EXECUTE format('REVOKE ALL ON FUNCTION trivia_competitive_origin_guard(),trivia_competitive_action_guard() FROM %I',r);
  END IF;
 END LOOP;
END $$;
COMMIT;
