BEGIN;
-- One DB clock for observer leases and action admission; no client time input.
CREATE FUNCTION trivia_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$
  SELECT timezone('UTC',clock_timestamp())::timestamp(3)
$$;
ALTER TABLE "IntentoTriviaRush" ADD COLUMN "presenciaVersion" integer;
ALTER TABLE "IntentoTriviaRush" ADD CONSTRAINT trivia_presence_version CHECK
  ("presenciaVersion" IS NULL OR ("presenciaVersion" = 1 AND "evidenciaVersion" IS NOT DISTINCT FROM 1));
CREATE FUNCTION trivia_presence_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grace timestamp;
BEGIN
  IF NEW."presenciaVersion" IS DISTINCT FROM OLD."presenciaVersion" THEN
    RAISE EXCEPTION 'Presence enrollment is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD."presenciaVersion"=1 AND OLD.estado='ACTIVO' AND NEW.estado<>'ACTIVO' THEN
    SELECT "graceUntil" INTO grace FROM "TriviaPresence" WHERE "attemptId"=OLD.id;
    IF grace < OLD."venceEn" AND NEW."finalizadoEn" >= grace
      AND (NEW.estado <> 'ABANDONADO' OR NEW."finalizadoEn" <> grace) THEN
      RAISE EXCEPTION 'Earlier definitive absence must retain its terminal date' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trivia_presence_origin_guard BEFORE UPDATE ON "IntentoTriviaRush"
  FOR EACH ROW EXECUTE FUNCTION trivia_presence_origin_guard();

CREATE TABLE "TriviaPresence" (
  "attemptId" uuid PRIMARY KEY REFERENCES "IntentoTriviaRush"(id) ON DELETE RESTRICT,
  "disconnectedAt" timestamp(3), "graceUntil" timestamp(3),
  CHECK (("disconnectedAt" IS NULL AND "graceUntil" IS NULL) OR
    ("disconnectedAt" IS NOT NULL AND "graceUntil" IS NOT NULL AND "graceUntil" = "disconnectedAt" + interval '20 seconds'))
);
CREATE TABLE "TriviaConnection" (
  id uuid PRIMARY KEY,
  "attemptId" uuid NOT NULL REFERENCES "TriviaPresence"("attemptId") ON DELETE RESTRICT,
  "instanceId" uuid NOT NULL,
  "connectedAt" timestamp(3) NOT NULL,
  "lastSeenAt" timestamp(3) NOT NULL,
  "leaseUntil" timestamp(3) NOT NULL,
  state text NOT NULL CHECK (state IN ('OPEN','CLOSED','UNKNOWN','RETIRED')),
  "closedAt" timestamp(3),
  CHECK ("lastSeenAt" >= "connectedAt" AND "leaseUntil" > "lastSeenAt"),
  CHECK ((state = 'OPEN' AND "closedAt" IS NULL) OR (state <> 'OPEN' AND "closedAt" IS NOT NULL AND "closedAt" >= "connectedAt"))
);
CREATE INDEX trivia_connection_attempt ON "TriviaConnection"("attemptId",state);
CREATE TABLE "TriviaPresenceEvent" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "attemptId" uuid NOT NULL REFERENCES "IntentoTriviaRush"(id) ON DELETE RESTRICT,
  "connectionId" uuid REFERENCES "TriviaConnection"(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('CONNECTED','DISCONNECTED','UNCERTAIN','RETIRED','GRACE','EXPIRED','ABANDONED')),
  "observedAt" timestamp(3) NOT NULL,
  "recordedAt" timestamp(3) NOT NULL DEFAULT timezone('UTC',clock_timestamp())
);
CREATE INDEX trivia_presence_event_attempt ON "TriviaPresenceEvent"("attemptId",id);
CREATE FUNCTION trivia_presence_action_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grace timestamp; deadline timestamp; active_version integer; action_at timestamp; server_at timestamp;
BEGIN
  SELECT "presenciaVersion", "venceEn" INTO active_version, deadline FROM "IntentoTriviaRush" WHERE id=NEW."intentoId";
  IF active_version IS DISTINCT FROM 1 THEN RETURN NEW; END IF;
  SELECT "graceUntil" INTO grace FROM "TriviaPresence" WHERE "attemptId"=NEW."intentoId";
  IF TG_TABLE_NAME='TriviaRushRespuesta' THEN action_at:=NEW."respondidaEn"; ELSE action_at:=NEW."activadoEn"; END IF;
  server_at:=trivia_presence_require_open(NEW."intentoId");
  IF action_at >= least(deadline,grace) OR server_at >= least(deadline,grace) THEN
    RAISE EXCEPTION 'Action after terminal deadline' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trivia_a_presence_action_guard BEFORE INSERT ON "TriviaRushRespuesta"
  FOR EACH ROW EXECUTE FUNCTION trivia_presence_action_guard();
CREATE TRIGGER trivia_a_presence_action_guard BEFORE INSERT ON "TriviaRushPotenciador"
  FOR EACH ROW EXECUTE FUNCTION trivia_presence_action_guard();
CREATE FUNCTION trivia_presence_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Presence events are immutable' USING ERRCODE='23514'; END $$;
CREATE TRIGGER trivia_presence_event_guard BEFORE UPDATE OR DELETE ON "TriviaPresenceEvent"
  FOR EACH ROW EXECUTE FUNCTION trivia_presence_event_guard();
CREATE FUNCTION trivia_connection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Connection evidence must be retained' USING ERRCODE='23514'; END IF;
  IF NEW.id <> OLD.id OR NEW."attemptId" <> OLD."attemptId" OR NEW."instanceId" <> OLD."instanceId"
    OR NEW."connectedAt" <> OLD."connectedAt" OR NEW."lastSeenAt" < OLD."lastSeenAt"
    OR (OLD.state IN ('CLOSED','RETIRED') AND NEW IS DISTINCT FROM OLD)
    OR (OLD.state='UNKNOWN' AND (NEW.state NOT IN ('UNKNOWN','RETIRED') OR NEW."closedAt" IS DISTINCT FROM OLD."closedAt"
      OR NEW."lastSeenAt" <> OLD."lastSeenAt" OR NEW."leaseUntil" <> OLD."leaseUntil")) THEN
    RAISE EXCEPTION 'Connection identity/history is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trivia_connection_guard BEFORE UPDATE OR DELETE ON "TriviaConnection"
  FOR EACH ROW EXECUTE FUNCTION trivia_connection_guard();

-- Every operation locks owner before attempt. PostgreSQL is the shared authority.
CREATE FUNCTION trivia_presence_lock(a uuid) RETURNS "IntentoTriviaRush" LANGUAGE plpgsql AS $$
DECLARE owner_id uuid; attempt "IntentoTriviaRush";
BEGIN
  SELECT "usuarioId" INTO owner_id FROM "IntentoTriviaRush" WHERE id=a;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Unknown attempt' USING ERRCODE='23514'; END IF;
  PERFORM 1 FROM "Usuario" WHERE id=owner_id FOR UPDATE;
  SELECT * INTO attempt FROM "IntentoTriviaRush" WHERE id=a FOR UPDATE;
  RETURN attempt;
END $$;

-- This is not a public heartbeat. Only a persisted, authenticated observation
-- can authorize an action. All contenders serialize through owner -> attempt.
CREATE FUNCTION trivia_presence_require_open(a uuid) RETURNS timestamp LANGUAGE plpgsql AS $$
DECLARE attempt "IntentoTriviaRush"; at_time timestamp; grace timestamp;
BEGIN
  attempt := trivia_presence_lock(a);
  at_time := trivia_presence_now();
  IF attempt."presenciaVersion" IS DISTINCT FROM 1 THEN RETURN at_time; END IF;
  SELECT "graceUntil" INTO grace FROM "TriviaPresence" WHERE "attemptId"=a;
  IF attempt.estado <> 'ACTIVO' OR at_time >= least(attempt."venceEn",grace) THEN
    RAISE EXCEPTION 'Action after terminal deadline' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM "TriviaConnection" WHERE "attemptId"=a AND state='OPEN'
    AND "connectedAt" <= at_time AND "lastSeenAt" <= at_time AND "leaseUntil" > at_time) THEN
    RAISE EXCEPTION 'TRIVIA_PRESENCE_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN at_time;
END $$;
CREATE FUNCTION trivia_presence_resolve(a uuid, at_time timestamp) RETURNS text LANGUAGE plpgsql AS $$
DECLARE attempt "IntentoTriviaRush"; deadline timestamp; terminal text; c record;
BEGIN
  attempt := trivia_presence_lock(a);
  at_time := coalesce(at_time,trivia_presence_now());
  IF attempt."presenciaVersion" IS DISTINCT FROM 1 OR attempt.estado <> 'ACTIVO' THEN RETURN attempt.estado::text; END IF;
  -- A lost observer is uncertainty, never an invented client disconnect.
  FOR c IN UPDATE "TriviaConnection" SET state='UNKNOWN', "closedAt"=at_time
    WHERE "attemptId"=a AND state='OPEN' AND "leaseUntil" <= at_time RETURNING id LOOP
    INSERT INTO "TriviaPresenceEvent"("attemptId","connectionId",kind,"observedAt") VALUES(a,c.id,'UNCERTAIN',at_time);
  END LOOP;
  SELECT "graceUntil" INTO deadline FROM "TriviaPresence" WHERE "attemptId"=a;
  IF deadline IS NOT NULL AND deadline < attempt."venceEn" AND deadline <= at_time THEN
    terminal := 'ABANDONADO';
  ELSIF attempt."venceEn" <= at_time THEN
    deadline := attempt."venceEn"; terminal := 'EXPIRADO';
  ELSE RETURN 'ACTIVO'; END IF;
  UPDATE "IntentoTriviaRush" SET estado=terminal::"EstadoIntentoTriviaRush", "finalizadoEn"=deadline,
    "preguntaActualId"=NULL, "preguntaIniciaEn"=NULL, "escudoComboActivo"=false, "segundaOportunidadActiva"=false WHERE id=a;
  INSERT INTO "TriviaPresenceEvent"("attemptId",kind,"observedAt") VALUES
    (a,CASE WHEN terminal='EXPIRADO' THEN 'EXPIRED' ELSE 'ABANDONED' END,deadline);
  RETURN terminal;
END $$;

CREATE FUNCTION trivia_presence_connect(a uuid, u uuid, c uuid, instance uuid, at_time timestamp)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE attempt "IntentoTriviaRush"; terminal text; old "TriviaConnection"; retired record;
BEGIN
  attempt := trivia_presence_lock(a);
  at_time := coalesce(at_time,trivia_presence_now());
  IF attempt."usuarioId" <> u OR attempt."presenciaVersion" IS DISTINCT FROM 1
    OR NOT EXISTS(SELECT 1 FROM "Usuario" WHERE id=u AND rol='ESTUDIANTE') THEN
    RAISE EXCEPTION 'Presence not authorized' USING ERRCODE='42501'; END IF;
  terminal := trivia_presence_resolve(a,at_time);
  IF terminal <> 'ACTIVO' THEN RETURN terminal; END IF;
  SELECT * INTO old FROM "TriviaConnection" WHERE id=c;
  IF old.id IS NOT NULL THEN
    IF old."attemptId" <> a OR old."instanceId" <> instance THEN RAISE EXCEPTION 'Connection identity conflict' USING ERRCODE='23514'; END IF;
    RETURN CASE WHEN old.state='OPEN' THEN 'ACTIVO' ELSE 'STALE' END;
  END IF;
  INSERT INTO "TriviaPresence"("attemptId") VALUES(a) ON CONFLICT DO NOTHING;
  -- New authenticated observation supersedes unknown observers, without inferring their disconnect time.
  FOR retired IN UPDATE "TriviaConnection" SET state='RETIRED' WHERE "attemptId"=a AND state='UNKNOWN' RETURNING id LOOP
    INSERT INTO "TriviaPresenceEvent"("attemptId","connectionId",kind,"observedAt") VALUES(a,retired.id,'RETIRED',at_time);
  END LOOP;
  INSERT INTO "TriviaConnection" VALUES(c,a,instance,at_time,at_time,at_time+interval '20 seconds','OPEN',NULL);
  UPDATE "TriviaPresence" SET "disconnectedAt"=NULL,"graceUntil"=NULL WHERE "attemptId"=a;
  INSERT INTO "TriviaPresenceEvent"("attemptId","connectionId",kind,"observedAt") VALUES(a,c,'CONNECTED',at_time);
  RETURN 'ACTIVO';
END $$;

CREATE FUNCTION trivia_presence_observe(a uuid, c uuid, instance uuid, operation text, at_time timestamp)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE terminal text; connection "TriviaConnection";
BEGIN
  PERFORM trivia_presence_lock(a);
  at_time := coalesce(at_time,trivia_presence_now());
  terminal := trivia_presence_resolve(a,at_time);
  SELECT * INTO connection FROM "TriviaConnection" WHERE id=c AND "attemptId"=a AND "instanceId"=instance;
  IF connection.id IS NULL OR connection.state <> 'OPEN' THEN RETURN 'STALE'; END IF;
  IF terminal <> 'ACTIVO' THEN RETURN terminal; END IF;
  IF operation='RENEW' THEN
    UPDATE "TriviaConnection" SET "lastSeenAt"=at_time,"leaseUntil"=at_time+interval '20 seconds' WHERE id=c;
  ELSIF operation IN ('DISCONNECT','UNCERTAIN') THEN
    UPDATE "TriviaConnection" SET state=CASE WHEN operation='DISCONNECT' THEN 'CLOSED' ELSE 'UNKNOWN' END,"closedAt"=at_time WHERE id=c;
    INSERT INTO "TriviaPresenceEvent"("attemptId","connectionId",kind,"observedAt")
      VALUES(a,c,CASE WHEN operation='DISCONNECT' THEN 'DISCONNECTED' ELSE 'UNCERTAIN' END,at_time);
    IF operation='DISCONNECT' AND NOT EXISTS(SELECT 1 FROM "TriviaConnection" WHERE "attemptId"=a AND state IN ('OPEN','UNKNOWN')) THEN
      UPDATE "TriviaPresence" SET "disconnectedAt"=at_time,"graceUntil"=at_time+interval '20 seconds' WHERE "attemptId"=a;
      INSERT INTO "TriviaPresenceEvent"("attemptId",kind,"observedAt") VALUES(a,'GRACE',at_time);
    END IF;
  ELSE RAISE EXCEPTION 'Invalid observation' USING ERRCODE='23514'; END IF;
  RETURN terminal;
END $$;

ALTER TABLE "TriviaPresence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TriviaConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TriviaPresenceEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TriviaPresence", "TriviaConnection", "TriviaPresenceEvent" FROM PUBLIC;
REVOKE ALL ON SEQUENCE "TriviaPresenceEvent_id_seq" FROM PUBLIC;
REVOKE ALL ON FUNCTION trivia_presence_now(), trivia_presence_require_open(uuid), trivia_presence_lock(uuid), trivia_presence_resolve(uuid,timestamp),
  trivia_presence_connect(uuid,uuid,uuid,uuid,timestamp), trivia_presence_observe(uuid,uuid,uuid,text,timestamp) FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON "TriviaPresence", "TriviaConnection", "TriviaPresenceEvent" FROM %I',r);
      EXECUTE format('REVOKE ALL ON FUNCTION trivia_presence_now(), trivia_presence_require_open(uuid), trivia_presence_lock(uuid), trivia_presence_resolve(uuid,timestamp), trivia_presence_connect(uuid,uuid,uuid,uuid,timestamp), trivia_presence_observe(uuid,uuid,uuid,text,timestamp) FROM %I',r);
      EXECUTE format('REVOKE ALL ON SEQUENCE "TriviaPresenceEvent_id_seq" FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMIT;
