BEGIN;
-- Opt-in only at new competitive matchmaking. No historical backfill.
ALTER TABLE "PartidaTiraAfloja" ADD COLUMN "temporalVersion" integer,
 ADD COLUMN "activaEn" timestamp(6), ADD COLUMN "activaVersion" integer,
 ADD COLUMN "activaPresenceId" bigint;
ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT tug_temporal_shape CHECK (
 ("temporalVersion" IS NULL AND "activaEn" IS NULL AND "activaVersion" IS NULL AND "activaPresenceId" IS NULL)
 OR ("temporalVersion"=1 AND "competitiveRulesVersion"=1 AND
   (("activaEn" IS NULL AND "activaVersion" IS NULL AND "activaPresenceId" IS NULL)
    OR ("activaEn" IS NOT NULL AND "activaVersion" IS NOT NULL AND "activaPresenceId" IS NOT NULL))));

CREATE FUNCTION tug_round_decision_at(m "PartidaTiraAfloja") RETURNS timestamp LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN count(*)=2 THEN max("recibidaEn") ELSE m."rondaVenceEn" END
 FROM "TiraAflojaRespuesta" WHERE "partidaId"=m.id AND ronda=m."rondaActual"
$$;
CREATE FUNCTION tug_temporal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t timestamp;
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW."activaEn" IS NOT NULL OR NEW."activaVersion" IS NOT NULL OR NEW."activaPresenceId" IS NOT NULL
    OR (NEW."temporalVersion" IS NOT NULL AND
      (NEW."temporalVersion"<>1 OR NEW."competitiveRulesVersion" IS DISTINCT FROM 1
       OR NOT NEW."prepararEvidencia" OR NEW.estado<>'BUSCANDO')) THEN
      RAISE EXCEPTION 'TUG_TEMPORAL_INVALID_ORIGIN' USING ERRCODE='23514'; END IF;
   IF NEW."temporalVersion"=1 THEN
     NEW."fechaCreacion":=tug_presence_now();
     NEW."expiraEn":=NEW."fechaCreacion"+interval '2 minutes';
   END IF;
   RETURN NEW;
 END IF;
 IF NEW."temporalVersion" IS DISTINCT FROM OLD."temporalVersion"
   OR ROW(NEW."activaEn",NEW."activaVersion",NEW."activaPresenceId")
      IS DISTINCT FROM ROW(OLD."activaEn",OLD."activaVersion",OLD."activaPresenceId") THEN
    RAISE EXCEPTION 'TUG_TEMPORAL_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF OLD."temporalVersion" IS DISTINCT FROM 1 THEN RETURN NEW; END IF;
 IF OLD.estado='BUSCANDO' AND NEW.estado='PREPARANDO' THEN
   NEW."fechaEmparejamiento":=tug_presence_now();
   NEW."expiraEn":=NEW."fechaEmparejamiento"+interval '30 minutes';
 ELSIF OLD.estado='PREPARANDO' AND NEW.estado='ACTIVA' THEN
   t:=tug_presence_now(); -- caller holds sorted users -> match; same presence clock
   NEW."activaEn":=t; NEW."activaVersion":=NEW.version;
   SELECT coalesce(max(id),0) INTO NEW."activaPresenceId" FROM "TugPresenceEvent" WHERE "matchId"=NEW.id;
   NEW."rondaIniciaEn":=t+interval '3 seconds'; NEW."rondaVenceEn":=t+interval '13 seconds';
   NEW."snapshotInicial":=jsonb_set(NEW."snapshotInicial",'{config}',NEW."snapshotInicial"->'config' ||
     jsonb_build_object('temporalVersion',1,'activaEn',to_char(t,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
       'activaVersion',NEW.version,'activaPresenceId',NEW."activaPresenceId"::text));
 ELSIF OLD.estado='ACTIVA' AND NEW."rondaActual"=OLD."rondaActual"+1 THEN
   t:=tug_round_decision_at(OLD);
   NEW."rondaIniciaEn":=t+interval '1.5 seconds'; NEW."rondaVenceEn":=t+interval '11.5 seconds';
 ELSIF OLD.estado='ACTIVA' AND NEW.estado='FINALIZADA'
   AND NOT EXISTS(SELECT 1 FROM "TugAbandonment" WHERE "matchId"=OLD.id) THEN
   NEW."fechaFinalizacion":=tug_round_decision_at(OLD);
 ELSIF OLD.estado='ACTIVA' AND NEW.estado='EXPIRADA' THEN
   NEW."fechaFinalizacion":=OLD."expiraEn";
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tug_match_aa_temporal BEFORE INSERT OR UPDATE ON "PartidaTiraAfloja"
 FOR EACH ROW EXECUTE FUNCTION tug_temporal_guard();

CREATE FUNCTION tug_temporal_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "PartidaTiraAfloja";
BEGIN
 SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=NEW."partidaId";
 IF m."temporalVersion"=1 AND NEW.tipo='RONDA_INICIADA' THEN
   NEW.datos:=NEW.datos || jsonb_build_object(
     'iniciaEn',to_char(m."rondaIniciaEn",'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
     'venceEn',to_char(m."rondaVenceEn",'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tug_events_aa_temporal BEFORE INSERT ON "TiraAflojaEvento"
 FOR EACH ROW EXECUTE FUNCTION tug_temporal_event_guard();
CREATE FUNCTION tug_temporal_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM "PartidaTiraAfloja" WHERE id=NEW."partidaId" AND "temporalVersion"=1) THEN
   NEW."recibidaEn":=tug_presence_require_open(NEW."partidaId",NEW."usuarioId");
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tug_answers_ab_temporal BEFORE INSERT ON "TiraAflojaRespuesta"
 FOR EACH ROW EXECUTE FUNCTION tug_temporal_answer_guard();
REVOKE ALL ON FUNCTION tug_round_decision_at("PartidaTiraAfloja"),tug_temporal_guard(),tug_temporal_event_guard(),tug_temporal_answer_guard() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION tug_round_decision_at("PartidaTiraAfloja"),tug_temporal_guard(),tug_temporal_event_guard(),tug_temporal_answer_guard() FROM %I',r);
  END IF;
 END LOOP;
END $$;
-- Preserve every published evidence guard; only the new contract clock differs.
CREATE OR REPLACE FUNCTION tug_child_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m "PartidaTiraAfloja"; q jsonb; a jsonb; now_at timestamp;
BEGIN
  SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD."partidaId" ELSE NEW."partidaId" END FOR UPDATE;
  IF TG_OP='UPDATE' AND OLD."partidaId"<>NEW."partidaId" AND EXISTS (SELECT 1 FROM "PartidaTiraAfloja" WHERE id=OLD."partidaId" AND "evidenciaVersion" IS NOT NULL)
    THEN RAISE EXCEPTION 'Cannot move Tug evidence' USING ERRCODE='23514'; END IF;
  IF m."evidenciaVersion" IS NULL THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  IF TG_TABLE_NAME='TiraAflojaPregunta' OR TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Tug evidence is immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='TiraAflojaRespuesta' THEN
    now_at := CASE WHEN m."temporalVersion"=1 THEN tug_presence_now() ELSE clock_timestamp() AT TIME ZONE 'UTC' END; -- after all lock waits; legacy unchanged
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
COMMIT;
