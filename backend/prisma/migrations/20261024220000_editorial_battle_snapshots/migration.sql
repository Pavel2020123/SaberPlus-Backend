ALTER TABLE "BatallaPregunta" ADD COLUMN "snapshotInicial" jsonb;
CREATE INDEX "BatallaPregunta_editorial_snapshot_idx" ON "BatallaPregunta" USING GIN ("snapshotInicial" jsonb_path_ops);

CREATE FUNCTION editorial_battle_snapshot_valid(s jsonb, question_id text, position_number integer, option_order jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE q jsonb; ids text[]; ordered text[];
BEGIN
  IF s IS NULL OR jsonb_typeof(s) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  q := s->'pregunta';
  IF s->'version' IS DISTINCT FROM '1'::jsonb OR s->>'preguntaId' IS DISTINCT FROM question_id
    OR s->'orden' IS DISTINCT FROM to_jsonb(position_number) OR position_number < 0
    OR s->'opcionesOrden' IS DISTINCT FROM option_order OR q->>'id' IS DISTINCT FROM question_id
    OR nullif(q->>'enunciado','') IS NULL OR q->'subtema'->'tema'->>'area' IS NULL
    OR jsonb_typeof(q->'respuestas') IS DISTINCT FROM 'array'
    OR jsonb_typeof(option_order) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(q->'respuestas') < 2 OR jsonb_array_length(q->'respuestas') <> jsonb_array_length(option_order)
    OR (SELECT count(*) FROM jsonb_array_elements(q->'respuestas') r WHERE r->'esCorrecta'='true'::jsonb) <> 1
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(q->'respuestas') r
      WHERE nullif(r->>'id','') IS NULL OR nullif(r->>'texto','') IS NULL OR jsonb_typeof(r->'esCorrecta') IS DISTINCT FROM 'boolean') THEN RETURN false; END IF;
  SELECT array_agg(r->>'id' ORDER BY r->>'id') INTO ids FROM jsonb_array_elements(q->'respuestas') r;
  SELECT array_agg(value ORDER BY value) INTO ordered FROM jsonb_array_elements_text(option_order);
  RETURN coalesce(ids = ordered AND cardinality(ids) = (SELECT count(DISTINCT id) FROM unnest(ids) id),false);
END $$;
-- La copia contiene soluciones privadas. El acceso siempre pasa por Nest/JWT;
-- no exponerla ni permitir fabricar participantes/respuestas por PostgREST.
ALTER TABLE "Batalla" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BatallaPregunta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BatallaParticipante" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BatallaRespuesta" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Batalla","BatallaPregunta","BatallaParticipante","BatallaRespuesta" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON "Batalla","BatallaPregunta","BatallaParticipante","BatallaRespuesta" FROM anon;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON "Batalla","BatallaPregunta","BatallaParticipante","BatallaRespuesta" FROM authenticated;
  END IF;
END $$;
ALTER TABLE "BatallaPregunta" ADD CONSTRAINT editorial_battle_snapshot_context CHECK
  ("snapshotInicial" IS NULL OR editorial_battle_snapshot_valid("snapshotInicial","preguntaId",orden,"opcionesOrden"));
CREATE FUNCTION editorial_battle_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD."snapshotInicial" IS NOT NULL AND EXISTS(SELECT 1 FROM "Batalla" WHERE id=OLD."batallaId") THEN RAISE EXCEPTION 'La copia de batalla se conserva' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW."snapshotInicial" IS DISTINCT FROM OLD."snapshotInicial" OR
    (OLD."snapshotInicial" IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'La copia de batalla es inmutable y no se rellena legado' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER editorial_battle_snapshot_guard BEFORE UPDATE OR DELETE ON "BatallaPregunta"
  FOR EACH ROW EXECUTE FUNCTION editorial_battle_snapshot_guard();

CREATE FUNCTION editorial_battle_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assignment "BatallaPregunta"; match "Batalla"; participant "BatallaParticipante"; selected jsonb;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT * INTO assignment FROM "BatallaPregunta" WHERE "batallaId"=OLD."batallaId" AND "preguntaId"=OLD."preguntaId";
    IF assignment."snapshotInicial" IS NOT NULL AND (TG_OP<>'DELETE' OR EXISTS(SELECT 1 FROM "Batalla" WHERE id=OLD."batallaId")) THEN RAISE EXCEPTION 'La respuesta original de batalla es inmutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  END IF;
  SELECT * INTO assignment FROM "BatallaPregunta" WHERE "batallaId"=NEW."batallaId" AND "preguntaId"=NEW."preguntaId";
  IF assignment."snapshotInicial" IS NULL THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'No mover respuestas al historial de otra batalla' USING ERRCODE='23514'; END IF;
  SELECT * INTO match FROM "Batalla" WHERE id=NEW."batallaId";
  SELECT * INTO participant FROM "BatallaParticipante" WHERE "batallaId"=NEW."batallaId" AND "usuarioId"=NEW."usuarioId" FOR UPDATE;
  SELECT value INTO selected FROM jsonb_array_elements(assignment."snapshotInicial"->'pregunta'->'respuestas') WHERE value->>'id'=NEW."respuestaSeleccionadaId";
  IF match.estado<>'ACTIVA' OR participant."iniciadoEn" IS NULL OR participant.estado<>'EN_JUEGO'
    OR NEW."usuarioId" NOT IN (match."retadorId",coalesce(match."rivalId",match."retadorId"))
    OR selected IS NULL OR NEW.orden IS DISTINCT FROM assignment.orden
    OR NEW."esCorrecta" IS DISTINCT FROM (selected->>'esCorrecta')::boolean
    OR NEW."respondidaEn" < participant."iniciadoEn" OR NEW."respondidaEn" >= match."expiraEn"
    OR EXISTS(SELECT 1 FROM "BatallaPregunta" previous WHERE previous."batallaId"=match.id AND previous.orden<assignment.orden
      AND NOT EXISTS(SELECT 1 FROM "BatallaRespuesta" r WHERE r."batallaId"=match.id AND r."usuarioId"=NEW."usuarioId" AND r.orden=previous.orden AND r."preguntaId"=previous."preguntaId")) THEN
    RAISE EXCEPTION 'Respuesta fuera de la copia o avance propio de batalla' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER editorial_battle_answer_guard BEFORE INSERT OR UPDATE OR DELETE ON "BatallaRespuesta"
  FOR EACH ROW EXECUTE FUNCTION editorial_battle_answer_guard();
REVOKE EXECUTE ON FUNCTION editorial_battle_snapshot_guard(),editorial_battle_answer_guard() FROM PUBLIC;

-- Conservar las opciones originales también en el historial académico H1.
-- Solo una respuesta BATALLA ya confirmada del mismo usuario/pregunta/sesión
-- puede aportar la copia; no aceptar referencias suministradas por el alumno.
CREATE OR REPLACE FUNCTION capturar_imagenes_historial() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE original jsonb;
BEGIN
  IF NEW.origen='BATALLA' THEN
    SELECT p."snapshotInicial" INTO original FROM "BatallaPregunta" p
    JOIN "BatallaRespuesta" r ON r."batallaId"=p."batallaId" AND r."preguntaId"=p."preguntaId"
    WHERE p."batallaId"=NEW."sesionId" AND p."preguntaId"=NEW."preguntaId"
      AND r."usuarioId"=NEW."usuarioId" AND r."respuestaSeleccionadaId"=NEW."respuestaSeleccionadaId"
      AND r."esCorrecta"=NEW."esCorrecta";
  END IF;
  IF original IS NOT NULL THEN
    INSERT INTO "ImagenHistorialRespuesta" ("historialId","rol","usuarioId","respuestaId","archivoId","sha256")
    SELECT NEW.id,v.rol,NEW."usuarioId",option->>'id',a.id,a.sha256
    FROM (VALUES ('SELECCIONADA'::"RolImagenHistorial",NEW."respuestaSeleccionadaId"),('CORRECTA'::"RolImagenHistorial",NEW."respuestaCorrectaId")) v(rol,respuesta)
    CROSS JOIN LATERAL jsonb_array_elements(original->'pregunta'->'respuestas') option
    JOIN "ArchivoEditorial" a ON option->>'imagenUrl'='/recursos/editoriales/'||a.id::text
    WHERE option->>'id'=v.respuesta AND a.estado='DISPONIBLE' AND (v.rol<>'CORRECTA' OR option->'esCorrecta'='true'::jsonb)
      AND NOT EXISTS(SELECT 1 FROM "RevocacionArchivoEditorial" x WHERE x."archivoId"=a.id);
    RETURN NEW;
  END IF;
  INSERT INTO "ImagenHistorialRespuesta" ("historialId","rol","usuarioId","respuestaId","archivoId","sha256")
  SELECT NEW.id,v.rol,NEW."usuarioId",r.id,a.id,a.sha256
  FROM (VALUES ('SELECCIONADA'::"RolImagenHistorial",NEW."respuestaSeleccionadaId"),('CORRECTA'::"RolImagenHistorial",NEW."respuestaCorrectaId")) v(rol,respuesta)
  JOIN "Respuesta" r ON r.id=v.respuesta AND r."preguntaId"=NEW."preguntaId"
  JOIN "ArchivoEditorial" a ON a.id=r."archivoImagenId"
  WHERE a.estado='DISPONIBLE' AND r."imagenUrl"='/recursos/editoriales/'||a.id::text
    AND (v.rol<>'CORRECTA' OR r."esCorrecta")
    AND NOT EXISTS(SELECT 1 FROM "RevocacionArchivoEditorial" x WHERE x."archivoId"=a.id);
  RETURN NEW;
END $$;
