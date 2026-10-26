-- Separar CPU de la evidencia competitiva y presencia: no migrar partidas viejas.
ALTER TABLE "IntentoTriviaRush" ADD COLUMN "snapshotLocal" JSONB;
CREATE INDEX "IntentoTriviaRush_editorial_snapshot_idx"
  ON "IntentoTriviaRush" USING GIN ("snapshotInicial" jsonb_path_ops);
CREATE INDEX "IntentoTriviaRush_editorial_local_snapshot_idx"
  ON "IntentoTriviaRush" USING GIN ("snapshotLocal" jsonb_path_ops);

CREATE FUNCTION editorial_local_snapshot_valid(s jsonb, areas jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE q integer; entry jsonb; question jsonb; n integer := 0; seen text[] := '{}'; options text[]; ordered text[];
BEGIN
  IF s IS NULL OR jsonb_typeof(s) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  q := (s->>'q')::integer;
  IF q IS NULL OR q NOT BETWEEN 4 AND 30 OR s->>'version' IS DISTINCT FROM '1'
    OR s->'config'->>'modalidad' IS DISTINCT FROM 'TUG_LOCAL'
    OR s->'config'->'areas' IS DISTINCT FROM areas
    OR s->'config'->>'duracionSegundos' IS DISTINCT FROM '600'
    OR s->'config'->>'versionReglas' IS DISTINCT FROM '1'
    OR s->'ghost' IS DISTINCT FROM 'null'::jsonb
    OR jsonb_typeof(s->'questions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(s->'questions') <> q THEN RETURN false; END IF;
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
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
ALTER TABLE "IntentoTriviaRush" ADD CONSTRAINT editorial_local_snapshot_context CHECK (
  "snapshotLocal" IS NULL OR (
    modalidad::text IS NOT DISTINCT FROM 'TUG_LOCAL' AND "evidenciaVersion" IS NULL
    AND "presenciaVersion" IS NULL AND "competitiveRulesVersion" IS NULL
    AND editorial_local_snapshot_valid("snapshotLocal",to_jsonb(areas))
  )
);
CREATE FUNCTION editorial_local_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."snapshotLocal" IS DISTINCT FROM OLD."snapshotLocal"
    OR (OLD."snapshotLocal" IS NOT NULL AND (
      NEW."usuarioId" IS DISTINCT FROM OLD."usuarioId" OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.areas IS DISTINCT FROM OLD.areas OR NEW."iniciadoEn" IS DISTINCT FROM OLD."iniciadoEn"
      OR NEW."duracionBaseSegundos" IS DISTINCT FROM OLD."duracionBaseSegundos"
      OR NEW."versionReglas" IS DISTINCT FROM OLD."versionReglas")) THEN
    RAISE EXCEPTION 'La copia original CPU es inmutable; no se incorpora legado' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER editorial_local_snapshot_guard BEFORE UPDATE ON "IntentoTriviaRush"
  FOR EACH ROW EXECUTE FUNCTION editorial_local_snapshot_guard();
REVOKE EXECUTE ON FUNCTION editorial_local_snapshot_guard() FROM PUBLIC;

-- Las confirmaciones que respaldan acceso histórico tampoco se reescriben.
-- Las filas antiguas sin copia y la evidencia V1 de Trivia conservan sus guards.
CREATE FUNCTION editorial_local_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE attempt "IntentoTriviaRush"; entry jsonb; selected jsonb;
BEGIN
  -- Revisar también el origen: mover una confirmación a una partida legada
  -- no debe eludir la inmutabilidad comprobando solo el nuevo intentoId.
  IF TG_OP = 'UPDATE' THEN
    SELECT * INTO attempt FROM "IntentoTriviaRush" WHERE id = OLD."intentoId" FOR UPDATE;
    IF attempt."snapshotLocal" IS NOT NULL THEN
      RAISE EXCEPTION 'La confirmación CPU no se mueve ni se reescribe' USING ERRCODE='23514';
    END IF;
  END IF;
  SELECT * INTO attempt FROM "IntentoTriviaRush"
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."intentoId" ELSE NEW."intentoId" END FOR UPDATE;
  IF attempt."snapshotLocal" IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' OR attempt.estado <> 'ACTIVO' THEN
    RAISE EXCEPTION 'La confirmación CPU es append-only durante la partida' USING ERRCODE='23514';
  END IF;
  SELECT value INTO entry FROM jsonb_array_elements(attempt."snapshotLocal"->'questions')
    WHERE value->>'preguntaId' = NEW."preguntaId";
  IF entry IS NULL OR NEW."preguntaId" IS DISTINCT FROM attempt."preguntaActualId"
    OR NEW."respondidaEn" < attempt."iniciadoEn" OR NEW."respondidaEn" >= attempt."venceEn" THEN
    RAISE EXCEPTION 'Confirmación fuera de la ronda original CPU' USING ERRCODE='23514';
  END IF;
  IF NEW."respuestaSeleccionadaId" IS NOT NULL THEN
    SELECT value INTO selected FROM jsonb_array_elements(entry->'pregunta'->'respuestas')
      WHERE value->>'id' = NEW."respuestaSeleccionadaId";
    IF selected IS NULL OR NEW."esCorrecta" IS DISTINCT FROM (selected->>'esCorrecta')::boolean THEN
      RAISE EXCEPTION 'Respuesta fuera de la copia CPU' USING ERRCODE='23514';
    END IF;
  ELSIF NEW."esCorrecta" OR NOT NEW."esFinal" THEN
    RAISE EXCEPTION 'Un cierre sin selección no es una respuesta correcta' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER editorial_local_answer_guard BEFORE INSERT OR UPDATE OR DELETE ON "TriviaRushRespuesta"
  FOR EACH ROW EXECUTE FUNCTION editorial_local_answer_guard();
REVOKE EXECUTE ON FUNCTION editorial_local_answer_guard() FROM PUBLIC;
