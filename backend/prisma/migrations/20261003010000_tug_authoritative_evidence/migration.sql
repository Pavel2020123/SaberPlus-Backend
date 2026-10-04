BEGIN;
ALTER TABLE "PartidaTiraAfloja"
  ADD COLUMN "prepararEvidencia" boolean NOT NULL DEFAULT false,
  ADD COLUMN "evidenciaVersion" integer,
  ADD COLUMN "snapshotInicial" jsonb,
  ADD COLUMN "qPartida" integer;

CREATE TABLE "TiraAflojaRondaPresentada" (
  "partidaId" uuid NOT NULL REFERENCES "PartidaTiraAfloja"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ronda integer NOT NULL CHECK (ronda BETWEEN 1 AND 20),
  "usuarioId" uuid NOT NULL,
  "preguntaId" text NOT NULL,
  "programadaEn" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "presentadaEn" timestamp(6) NOT NULL,
  "venceEn" timestamp(6) NOT NULL,
  "registradaEn" timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("partidaId", ronda, "usuarioId")
);

CREATE FUNCTION tug_snapshot_original_valid(s jsonb, m "PartidaTiraAfloja")
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE e jsonb; q jsonb; r jsonb; b record; option_row "Respuesta"; n integer := 0; seen text[] := '{}'; assigned "TiraAflojaPregunta";
BEGIN
  IF s->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(s->'qPartida') IS DISTINCT FROM 'number' OR (s->>'qPartida')::integer NOT BETWEEN 4 AND 20
    OR jsonb_typeof(s->'questions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(s->'questions') <> (s->>'qPartida')::integer
    OR s->'participants' IS DISTINCT FROM jsonb_build_object('A',m."jugadorAId",'B',m."jugadorBId")
    OR m."jugadorBId" IS NULL OR m."jugadorAId" = m."jugadorBId"
    OR s->'config'->'area' IS DISTINCT FROM to_jsonb(m)->'area'
    OR s->'config'->>'versionReglas' IS DISTINCT FROM '1' OR m."versionReglas" <> 1
    OR s->'config'->>'segundosPorRonda' IS DISTINCT FROM '10'
    OR s->'config'->>'pausaMs' IS DISTINCT FROM '1500'
    OR s->'config'->>'cuentaRegresivaMs' IS DISTINCT FROM '3000'
    OR s->'config'->>'posicionMeta' IS DISTINCT FROM '4'
    OR s->'config'->>'empateRapidezMs' IS DISTINCT FROM '200'
    OR (s->'config'->>'expiraEn')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM m."expiraEn"
    OR (SELECT count(*) FROM "TiraAflojaPregunta" WHERE "partidaId"=m.id) <> (s->>'qPartida')::integer
    THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(s->'questions') LOOP
    n := n+1; q := e->'pregunta';
    SELECT * INTO assigned FROM "TiraAflojaPregunta" WHERE "partidaId"=m.id AND orden=n;
    IF assigned."preguntaId" IS NULL OR e->>'orden' IS DISTINCT FROM n::text
      OR e->>'preguntaId' IS DISTINCT FROM assigned."preguntaId"
      OR e->'opcionesOrden' IS DISTINCT FROM assigned."opcionesOrden"
      OR q->>'id' IS DISTINCT FROM assigned."preguntaId" OR assigned."preguntaId"=ANY(seen)
      OR jsonb_typeof(q->'respuestas') IS DISTINCT FROM 'array'
      OR jsonb_array_length(q->'respuestas') < 2
      OR jsonb_array_length(q->'respuestas') <> jsonb_array_length(e->'opcionesOrden')
      OR (SELECT count(*) FROM jsonb_array_elements(q->'respuestas') a WHERE a->'esCorrecta'='true'::jsonb) <> 1
      OR (SELECT count(DISTINCT a->>'id') FROM jsonb_array_elements(q->'respuestas') a) <> jsonb_array_length(q->'respuestas')
      THEN RETURN false; END IF;
    SELECT p.*, t.area, t.nombre AS tema, st.nombre AS subtema INTO b
      FROM "Pregunta" p JOIN "Subtema" st ON st.id=p."subtemaId" JOIN "Tema" t ON t.id=st."temaId" WHERE p.id=assigned."preguntaId";
    IF b.id IS NULL OR nullif(b.enunciado,'') IS NULL
      OR q->'enunciado' IS DISTINCT FROM to_jsonb(b.enunciado)
      OR q->'imagenUrl' IS DISTINCT FROM coalesce(to_jsonb(b."imagenUrl"),'null'::jsonb)
      OR q->'explicacion' IS DISTINCT FROM coalesce(to_jsonb(b.explicacion),'null'::jsonb)
      OR q->>'dificultad' IS DISTINCT FROM b.dificultad::text
      OR q->>'area' IS DISTINCT FROM b.area::text OR q->>'tema' IS DISTINCT FROM b.tema OR q->>'subtema' IS DISTINCT FROM b.subtema
      OR q->'contexto' IS DISTINCT FROM coalesce((SELECT jsonb_build_object('id',c.id,'titulo',c.titulo,'contexto',c.contexto,'imagenUrl',c."imagenUrl") FROM "CasoPregunta" c WHERE c.id=b."casoId"),'null'::jsonb)
      OR (SELECT count(*) FROM "Respuesta" WHERE "preguntaId"=b.id) <> jsonb_array_length(q->'respuestas')
      THEN RETURN false; END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(q->'respuestas') LOOP
      SELECT * INTO option_row FROM "Respuesta" WHERE id=r->>'id' AND "preguntaId"=b.id;
      IF option_row.id IS NULL OR nullif(option_row.texto,'') IS NULL
        OR r IS DISTINCT FROM jsonb_build_object('id',option_row.id,'texto',option_row.texto,'esCorrecta',option_row."esCorrecta",'explicacion',option_row.explicacion)
        THEN RETURN false; END IF;
    END LOOP;
    IF (SELECT jsonb_agg(a->>'id') FROM jsonb_array_elements(q->'respuestas') a) IS DISTINCT FROM e->'opcionesOrden' THEN RETURN false; END IF;
    seen := array_append(seen,b.id);
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT tug_evidence_context CHECK (
  ("evidenciaVersion" IS NULL AND "snapshotInicial" IS NULL AND "qPartida" IS NULL) OR
  ("prepararEvidencia" AND "evidenciaVersion"=1 AND "snapshotInicial" IS NOT NULL AND "qPartida" BETWEEN 4 AND 20
    AND "evidenciaVersion" IS NOT NULL AND "qPartida" IS NOT NULL
    AND "qPartida"=("snapshotInicial"->>'qPartida')::integer)
);
CREATE FUNCTION tug_match_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW."evidenciaVersion" IS NOT NULL OR (NEW."prepararEvidencia" AND (NEW.estado <> 'BUSCANDO' OR NEW."rondaActual" <> 0 OR NEW."jugadorBId" IS NOT NULL))
      THEN RAISE EXCEPTION 'Tug evidence must originate in new matchmaking' USING ERRCODE='23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF OLD."evidenciaVersion" IS NOT NULL THEN RAISE EXCEPTION 'Tug evidence must be retained' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF NEW."prepararEvidencia" IS DISTINCT FROM OLD."prepararEvidencia" THEN RAISE EXCEPTION 'No retroactive Tug preparation' USING ERRCODE='23514'; END IF;
  IF OLD."evidenciaVersion" IS NOT NULL THEN
    IF ROW(NEW.id,NEW."snapshotInicial",NEW."evidenciaVersion",NEW."qPartida",NEW."jugadorAId",NEW."jugadorBId",NEW.area,NEW."versionReglas",NEW."expiraEn")
      IS DISTINCT FROM ROW(OLD.id,OLD."snapshotInicial",OLD."evidenciaVersion",OLD."qPartida",OLD."jugadorAId",OLD."jugadorBId",OLD.area,OLD."versionReglas",OLD."expiraEn")
      OR (OLD.estado NOT IN ('BUSCANDO','PREPARANDO','ACTIVA') AND NEW IS DISTINCT FROM OLD)
      THEN RAISE EXCEPTION 'Immutable Tug context or terminal' USING ERRCODE='23514'; END IF;
  ELSIF NEW."evidenciaVersion" IS NOT NULL THEN
    IF NOT OLD."prepararEvidencia" OR OLD.estado <> 'PREPARANDO' OR NEW.estado <> 'ACTIVA' OR NEW."rondaActual"<>1
      OR ROW(NEW."jugadorAId",NEW."jugadorBId",NEW.area,NEW."versionReglas",NEW."expiraEn") IS DISTINCT FROM ROW(OLD."jugadorAId",OLD."jugadorBId",OLD.area,OLD."versionReglas",OLD."expiraEn")
      OR NOT NEW."listoA" OR NOT NEW."listoB" OR NOT tug_snapshot_original_valid(NEW."snapshotInicial",NEW)
      THEN RAISE EXCEPTION 'Invalid original Tug snapshot' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW."evidenciaVersion" IS NOT NULL AND NEW.estado='ACTIVA' THEN
    IF NEW."rondaActual" NOT BETWEEN 1 AND NEW."qPartida" OR NEW."rondaActual" < OLD."rondaActual"
      OR (OLD."evidenciaVersion"=1 AND NEW."rondaActual">OLD."rondaActual"+1)
      OR (OLD."evidenciaVersion"=1 AND NEW."rondaActual"=OLD."rondaActual" AND ROW(NEW."rondaIniciaEn",NEW."rondaVenceEn") IS DISTINCT FROM ROW(OLD."rondaIniciaEn",OLD."rondaVenceEn"))
      OR NEW."preguntaActualId" IS DISTINCT FROM NEW."snapshotInicial"->'questions'->(NEW."rondaActual"-1)->>'preguntaId'
      OR NEW."rondaIniciaEn" IS NULL OR NEW."rondaVenceEn" IS NULL
      OR NEW."rondaVenceEn" <> NEW."rondaIniciaEn"+interval '10 seconds'
      THEN RAISE EXCEPTION 'Invalid Tug round context' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tug_match_evidence BEFORE INSERT OR UPDATE OR DELETE ON "PartidaTiraAfloja" FOR EACH ROW EXECUTE FUNCTION tug_match_evidence_guard();

CREATE FUNCTION tug_presented_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "PartidaTiraAfloja"; now_at timestamp;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Tug presentation is append only' USING ERRCODE='23514'; END IF;
  SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=NEW."partidaId" FOR UPDATE;
  now_at := clock_timestamp() AT TIME ZONE 'UTC';
  IF m."evidenciaVersion" IS DISTINCT FROM 1 OR m.estado<>'ACTIVA'
    OR NEW.ronda<>m."rondaActual" OR NEW."preguntaId" IS DISTINCT FROM m."preguntaActualId"
    OR NEW."usuarioId" NOT IN (m."jugadorAId",m."jugadorBId")
    OR NEW."venceEn" IS DISTINCT FROM m."rondaVenceEn"
    OR now_at < m."rondaIniciaEn" OR now_at >= least(m."rondaVenceEn",m."expiraEn")
    OR (SELECT count(*) FROM "Usuario" u WHERE u.id IN (m."jugadorAId",m."jugadorBId") AND u.rol='ESTUDIANTE') <> 2
    THEN RAISE EXCEPTION 'Round is not available to this Tug participant' USING ERRCODE='23514'; END IF;
  -- Enabling is this durable transition, never the scheduled start or a client timestamp.
  NEW."programadaEn" := m."rondaIniciaEn";
  NEW."presentadaEn" := date_trunc('milliseconds', now_at);
  NEW."registradaEn" := clock_timestamp() AT TIME ZONE 'UTC';
  RETURN NEW;
END $$;
CREATE TRIGGER tug_presented_evidence BEFORE INSERT OR UPDATE OR DELETE ON "TiraAflojaRondaPresentada" FOR EACH ROW EXECUTE FUNCTION tug_presented_guard();

-- Both participants must be enabled atomically, even for direct backend SQL writes.
CREATE FUNCTION tug_presented_pair_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expires_at timestamp;
BEGIN
  IF (SELECT count(*) FROM "TiraAflojaRondaPresentada" WHERE "partidaId"=NEW."partidaId" AND ronda=NEW.ronda) <> 2
    THEN RAISE EXCEPTION 'Tug enablement requires both participants atomically' USING ERRCODE='23514'; END IF;
  -- Checked at deferred COMMIT validation as well as at insertion. The round
  -- may already be closed in this transaction; use this row's frozen deadline.
  SELECT "expiraEn" INTO expires_at FROM "PartidaTiraAfloja" WHERE id=NEW."partidaId";
  IF expires_at IS NULL OR (clock_timestamp() AT TIME ZONE 'UTC') >= least(NEW."venceEn", expires_at)
    THEN RAISE EXCEPTION 'Tug enablement commit exceeds its deadline' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER tug_presented_pair AFTER INSERT ON "TiraAflojaRondaPresentada"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tug_presented_pair_guard();

CREATE FUNCTION tug_record_presented_round(match_id uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE m "PartidaTiraAfloja";
BEGIN
  SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=match_id FOR UPDATE;
  IF m."evidenciaVersion"=1 AND m.estado='ACTIVA' AND m."rondaIniciaEn" <= (clock_timestamp() AT TIME ZONE 'UTC') AND (clock_timestamp() AT TIME ZONE 'UTC') < least(m."rondaVenceEn",m."expiraEn") THEN
    IF EXISTS (SELECT 1 FROM "TiraAflojaRondaPresentada" WHERE "partidaId"=m.id AND ronda=m."rondaActual") THEN RETURN false; END IF;
    INSERT INTO "TiraAflojaRondaPresentada" ("partidaId",ronda,"usuarioId","preguntaId","presentadaEn","venceEn")
      SELECT m.id,m."rondaActual",u,m."preguntaActualId",m."rondaIniciaEn",m."rondaVenceEn" FROM unnest(ARRAY[m."jugadorAId",m."jugadorBId"]) u
      WHERE NOT EXISTS (SELECT 1 FROM "TiraAflojaRondaPresentada" r WHERE r."partidaId"=m.id AND r.ronda=m."rondaActual" AND r."usuarioId"=u);
    RETURN true;
  END IF;
  RETURN false;
END $$;

CREATE FUNCTION tug_child_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "PartidaTiraAfloja"; q jsonb; a jsonb; now_at timestamp;
BEGIN
  SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD."partidaId" ELSE NEW."partidaId" END FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD."partidaId"<>NEW."partidaId" AND EXISTS (SELECT 1 FROM "PartidaTiraAfloja" WHERE id=OLD."partidaId" AND "evidenciaVersion" IS NOT NULL)
    THEN RAISE EXCEPTION 'Cannot move Tug evidence' USING ERRCODE='23514'; END IF;
  IF m."evidenciaVersion" IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_TABLE_NAME='TiraAflojaPregunta' OR TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Tug evidence is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='TiraAflojaRespuesta' THEN
    now_at := clock_timestamp() AT TIME ZONE 'UTC'; -- after any row-lock wait
    q := m."snapshotInicial"->'questions'->(NEW.ronda-1);
    SELECT value INTO a FROM jsonb_array_elements(q->'pregunta'->'respuestas') WHERE value->>'id'=NEW."respuestaSeleccionadaId";
    IF m.estado<>'ACTIVA' OR NEW.ronda<>m."rondaActual" OR NEW."preguntaId" IS DISTINCT FROM q->>'preguntaId'
      OR NEW."usuarioId" NOT IN (m."jugadorAId",m."jugadorBId") OR a IS NULL
      OR NEW."esCorrecta" IS DISTINCT FROM (a->>'esCorrecta')::boolean
      OR NEW."recibidaEn" < m."rondaIniciaEn" OR NEW."recibidaEn">=least(m."rondaVenceEn",m."expiraEn")
      OR NEW."recibidaEn">now_at
      OR now_at >= least(m."rondaVenceEn",m."expiraEn")
      OR NOT EXISTS (SELECT 1 FROM "TiraAflojaRondaPresentada" r WHERE r."partidaId"=m.id AND r.ronda=NEW.ronda AND r."usuarioId"=NEW."usuarioId" AND r."presentadaEn" <= NEW."recibidaEn")
      THEN RAISE EXCEPTION 'Invalid original Tug answer' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tug_questions_evidence BEFORE INSERT OR UPDATE OR DELETE ON "TiraAflojaPregunta" FOR EACH ROW EXECUTE FUNCTION tug_child_evidence_guard();
CREATE TRIGGER tug_answers_evidence BEFORE INSERT OR UPDATE OR DELETE ON "TiraAflojaRespuesta" FOR EACH ROW EXECUTE FUNCTION tug_child_evidence_guard();
CREATE TRIGGER tug_events_evidence BEFORE INSERT OR UPDATE OR DELETE ON "TiraAflojaEvento" FOR EACH ROW EXECUTE FUNCTION tug_child_evidence_guard();

ALTER TABLE "TiraAflojaRondaPresentada" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PartidaTiraAfloja" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TiraAflojaPregunta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TiraAflojaRespuesta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TiraAflojaEvento" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "PartidaTiraAfloja", "TiraAflojaPregunta", "TiraAflojaRespuesta", "TiraAflojaEvento" FROM PUBLIC;
REVOKE ALL ON "TiraAflojaRondaPresentada" FROM PUBLIC;
REVOKE ALL ON FUNCTION tug_record_presented_round(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tug_snapshot_original_valid(jsonb,"PartidaTiraAfloja"), tug_match_evidence_guard(), tug_presented_guard(), tug_presented_pair_guard(), tug_child_evidence_guard() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON FUNCTION tug_snapshot_original_valid(jsonb,"PartidaTiraAfloja"), tug_match_evidence_guard(), tug_presented_guard(), tug_presented_pair_guard(), tug_child_evidence_guard() FROM anon;
    REVOKE ALL ON "PartidaTiraAfloja", "TiraAflojaPregunta", "TiraAflojaRespuesta", "TiraAflojaEvento" FROM anon;
    REVOKE ALL ON "TiraAflojaRondaPresentada" FROM anon; REVOKE ALL ON FUNCTION tug_record_presented_round(uuid) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON FUNCTION tug_snapshot_original_valid(jsonb,"PartidaTiraAfloja"), tug_match_evidence_guard(), tug_presented_guard(), tug_presented_pair_guard(), tug_child_evidence_guard() FROM authenticated;
    REVOKE ALL ON "PartidaTiraAfloja", "TiraAflojaPregunta", "TiraAflojaRespuesta", "TiraAflojaEvento" FROM authenticated;
    REVOKE ALL ON "TiraAflojaRondaPresentada" FROM authenticated; REVOKE ALL ON FUNCTION tug_record_presented_round(uuid) FROM authenticated;
  END IF;
END $$;
COMMIT;
