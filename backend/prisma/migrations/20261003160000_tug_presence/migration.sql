BEGIN;
-- One PostgreSQL clock; tests may replace this function only in their owned DB.
CREATE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$
 SELECT timezone('UTC',clock_timestamp())
$$;
ALTER TABLE "PartidaTiraAfloja" ADD COLUMN "presenciaVersion" integer;
ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT tug_presence_version CHECK
  ("presenciaVersion" IS NULL OR ("presenciaVersion"=1 AND "prepararEvidencia"));
CREATE FUNCTION tug_presence_origin_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."presenciaVersion" IS DISTINCT FROM OLD."presenciaVersion" THEN
    RAISE EXCEPTION 'Immutable Tug presence enrollment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tug_presence_origin BEFORE UPDATE ON "PartidaTiraAfloja"
FOR EACH ROW EXECUTE FUNCTION tug_presence_origin_guard();

CREATE TABLE "TugPresence" (
  "matchId" uuid NOT NULL REFERENCES "PartidaTiraAfloja"(id) ON DELETE RESTRICT,
  "userId" uuid NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT,
  "disconnectedAt" timestamp(6), "graceUntil" timestamp(6),
  PRIMARY KEY ("matchId","userId"),
  CHECK (("disconnectedAt" IS NULL AND "graceUntil" IS NULL) OR
    ("disconnectedAt" IS NOT NULL AND "graceUntil"="disconnectedAt"+interval '30 seconds'))
);
CREATE TABLE "TugConnection" (
  id uuid PRIMARY KEY, "matchId" uuid NOT NULL, "userId" uuid NOT NULL,
  "instanceId" uuid NOT NULL, "connectedAt" timestamp(6) NOT NULL,
  "lastSeenAt" timestamp(6) NOT NULL, "leaseUntil" timestamp(6) NOT NULL,
  "authUntil" timestamp(6),
  state text NOT NULL CHECK (state IN ('OPEN','CLOSED','UNKNOWN','RETIRED')),
  "closedAt" timestamp(6),
  FOREIGN KEY ("matchId","userId") REFERENCES "TugPresence"("matchId","userId") ON DELETE RESTRICT,
  CHECK ("leaseUntil">"lastSeenAt" AND "lastSeenAt">="connectedAt"),
  CHECK ("leaseUntil"=least("lastSeenAt"+interval '45 seconds',"authUntil")),
  CHECK ((state='OPEN' AND "closedAt" IS NULL) OR
    (state<>'OPEN' AND "closedAt" IS NOT NULL AND "closedAt">="connectedAt"))
);
CREATE INDEX tug_connection_match ON "TugConnection"("matchId",state,"leaseUntil");
CREATE TABLE "TugPresenceEvent" (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "matchId" uuid NOT NULL REFERENCES "PartidaTiraAfloja"(id) ON DELETE RESTRICT,
  "userId" uuid NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT,
  "connectionId" uuid REFERENCES "TugConnection"(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('CONNECTED','RENEWED','DISCONNECTED','UNKNOWN','RETIRED','GRACE','ABANDONED')),
  "observedAt" timestamp(6) NOT NULL,
  "recordedAt" timestamp(6) NOT NULL DEFAULT tug_presence_now()
);
CREATE INDEX tug_presence_events_match ON "TugPresenceEvent"("matchId",id);
CREATE TABLE "TugAbandonment" (
  "matchId" uuid NOT NULL, "userId" uuid NOT NULL, "effectiveAt" timestamp(6) NOT NULL,
  reason text NOT NULL CHECK (reason IN ('GRACE','EXPLICIT')),
  PRIMARY KEY ("matchId","userId"),
  FOREIGN KEY ("matchId","userId") REFERENCES "TugPresence"("matchId","userId") ON DELETE RESTRICT
);
CREATE FUNCTION tug_presence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Tug presence evidence is append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER tug_event_immutable BEFORE UPDATE OR DELETE ON "TugPresenceEvent" FOR EACH ROW EXECUTE FUNCTION tug_presence_immutable();
CREATE TRIGGER tug_abandonment_immutable BEFORE UPDATE OR DELETE ON "TugAbandonment" FOR EACH ROW EXECUTE FUNCTION tug_presence_immutable();
CREATE FUNCTION tug_connection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retain Tug connections' USING ERRCODE='23514'; END IF;
  IF ROW(NEW.id,NEW."matchId",NEW."userId",NEW."instanceId",NEW."connectedAt",NEW."authUntil")
    IS DISTINCT FROM ROW(OLD.id,OLD."matchId",OLD."userId",OLD."instanceId",OLD."connectedAt",OLD."authUntil")
    OR NEW."lastSeenAt"<OLD."lastSeenAt"
    OR (OLD.state IN ('CLOSED','RETIRED') AND NEW IS DISTINCT FROM OLD)
    OR (OLD.state='UNKNOWN' AND (NEW.state NOT IN ('UNKNOWN','RETIRED') OR
      ROW(NEW."closedAt",NEW."lastSeenAt",NEW."leaseUntil") IS DISTINCT FROM ROW(OLD."closedAt",OLD."lastSeenAt",OLD."leaseUntil"))) THEN
    RAISE EXCEPTION 'Immutable Tug connection identity/history' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tug_connection_history BEFORE UPDATE OR DELETE ON "TugConnection" FOR EACH ROW EXECUTE FUNCTION tug_connection_guard();

-- User-before-source direction of common settlement: sorted users, then match.
-- A future two-player verifier must acquire this pair BEFORE an individual
-- participant lock; the existing single-owner verifier protocol alone is not enough.
-- This stage never registers a TUG_MATCH verifier or credits XP.
CREATE FUNCTION tug_presence_lock(match_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM u.id FROM "Usuario" u JOIN "PartidaTiraAfloja" m ON u.id IN (m."jugadorAId",m."jugadorBId")
    WHERE m.id=match_id ORDER BY u.id FOR UPDATE OF u;
  PERFORM pg_advisory_xact_lock(hashtext('partida:'||match_id::text));
  PERFORM id FROM "PartidaTiraAfloja" WHERE id=match_id FOR UPDATE;
END $$;
CREATE FUNCTION tug_presence_refresh(match_id uuid, at_time timestamp DEFAULT NULL) RETURNS timestamp LANGUAGE plpgsql AS $$
DECLARE t timestamp; c "TugConnection";
BEGIN
  PERFORM tug_presence_lock(match_id);
  t:=coalesce(at_time,tug_presence_now());
  FOR c IN SELECT * FROM "TugConnection" WHERE "matchId"=match_id AND state='OPEN' AND "leaseUntil"<=t LOOP
    UPDATE "TugConnection" SET state='UNKNOWN',"closedAt"=t WHERE id=c.id;
    INSERT INTO "TugPresenceEvent"("matchId","userId","connectionId",kind,"observedAt")
      VALUES(match_id,c."userId",c.id,'UNKNOWN',t);
  END LOOP;
  RETURN t;
END $$;
CREATE FUNCTION tug_presence_connect(match_id uuid,user_id uuid,connection_id uuid,instance_id uuid,at_time timestamp DEFAULT NULL,auth_until timestamp DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE m "PartidaTiraAfloja"; t timestamp; c "TugConnection";
BEGIN
  t:=tug_presence_refresh(match_id,at_time);
  SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=match_id;
  IF m.id IS NULL OR user_id NOT IN (m."jugadorAId",coalesce(m."jugadorBId",m."jugadorAId")) THEN
    RAISE EXCEPTION 'Tug presence owner mismatch' USING ERRCODE='23514'; END IF;
  IF m."presenciaVersion" IS DISTINCT FROM 1 THEN RETURN 'LEGACY'; END IF;
  IF m.estado NOT IN ('BUSCANDO','PREPARANDO','ACTIVA') OR t>=m."expiraEn" OR EXISTS
    (SELECT 1 FROM "TugPresence" WHERE "matchId"=match_id AND "graceUntil"<=t) THEN RETURN 'TERMINAL_DUE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM "Usuario" WHERE id=user_id AND rol='ESTUDIANTE' AND NOT "debeCambiarContrasena") THEN
    RAISE EXCEPTION 'Ineligible Tug connection' USING ERRCODE='23514'; END IF;
  SELECT * INTO c FROM "TugConnection" WHERE id=connection_id;
  IF FOUND THEN
    IF ROW(c."matchId",c."userId",c."instanceId") IS DISTINCT FROM ROW(match_id,user_id,instance_id) THEN
      RAISE EXCEPTION 'Tug connection identity mismatch' USING ERRCODE='23514'; END IF;
    RETURN c.state;
  END IF;
  INSERT INTO "TugPresence"("matchId","userId") VALUES(match_id,user_id) ON CONFLICT DO NOTHING;
  FOR c IN SELECT * FROM "TugConnection" WHERE "matchId"=match_id AND "userId"=user_id AND state='UNKNOWN' LOOP
    UPDATE "TugConnection" SET state='RETIRED' WHERE id=c.id;
    INSERT INTO "TugPresenceEvent"("matchId","userId","connectionId",kind,"observedAt") VALUES(match_id,user_id,c.id,'RETIRED',t);
  END LOOP;
  IF auth_until<=t THEN RAISE EXCEPTION 'Expired Tug authentication' USING ERRCODE='23514'; END IF;
  INSERT INTO "TugConnection"(id,"matchId","userId","instanceId","connectedAt","lastSeenAt","leaseUntil","authUntil",state)
    VALUES(connection_id,match_id,user_id,instance_id,t,t,least(t+interval '45 seconds',auth_until),auth_until,'OPEN');
  UPDATE "TugPresence" SET "disconnectedAt"=NULL,"graceUntil"=NULL WHERE "matchId"=match_id AND "userId"=user_id;
  INSERT INTO "TugPresenceEvent"("matchId","userId","connectionId",kind,"observedAt") VALUES(match_id,user_id,connection_id,'CONNECTED',t);
  RETURN 'OPEN';
END $$;
CREATE FUNCTION tug_presence_observe(match_id uuid,connection_id uuid,instance_id uuid,operation text,at_time timestamp DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
DECLARE t timestamp; c "TugConnection"; m "PartidaTiraAfloja";
BEGIN
  t:=tug_presence_refresh(match_id,at_time);
  SELECT * INTO c FROM "TugConnection" WHERE id=connection_id;
  SELECT * INTO m FROM "PartidaTiraAfloja" WHERE id=match_id;
  IF c.id IS NULL OR c."matchId"<>match_id OR c."instanceId"<>instance_id THEN
    RAISE EXCEPTION 'Tug observer identity mismatch' USING ERRCODE='23514'; END IF;
  IF operation NOT IN ('RENEW','DISCONNECT','UNCERTAIN') THEN RAISE EXCEPTION 'Invalid observation'; END IF;
  IF c.state<>'OPEN' OR m.estado NOT IN ('BUSCANDO','PREPARANDO','ACTIVA') THEN RETURN c.state; END IF;
  IF t<c."lastSeenAt" THEN RETURN c.state; END IF;
  IF operation='RENEW' THEN
    UPDATE "TugConnection" SET "lastSeenAt"=t,"leaseUntil"=least(t+interval '45 seconds',c."authUntil") WHERE id=c.id;
  ELSE
    UPDATE "TugConnection" SET state=CASE WHEN operation='DISCONNECT' THEN 'CLOSED' ELSE 'UNKNOWN' END,"closedAt"=t WHERE id=c.id;
  END IF;
  INSERT INTO "TugPresenceEvent"("matchId","userId","connectionId",kind,"observedAt")
    VALUES(match_id,c."userId",c.id,CASE operation WHEN 'RENEW' THEN 'RENEWED' WHEN 'DISCONNECT' THEN 'DISCONNECTED' ELSE 'UNKNOWN' END,t);
  -- UNKNOWN is not a confirmed disconnect. Before ACTIVA there is no game grace.
  IF operation='DISCONNECT' AND m.estado='ACTIVA' AND NOT EXISTS
    (SELECT 1 FROM "TugConnection" WHERE "matchId"=match_id AND "userId"=c."userId" AND state IN ('OPEN','UNKNOWN')) THEN
    UPDATE "TugPresence" SET "disconnectedAt"=t,"graceUntil"=t+interval '30 seconds'
      WHERE "matchId"=match_id AND "userId"=c."userId" AND "graceUntil" IS NULL;
    IF FOUND THEN INSERT INTO "TugPresenceEvent"("matchId","userId","connectionId",kind,"observedAt") VALUES(match_id,c."userId",c.id,'GRACE',t); END IF;
  END IF;
  RETURN (SELECT state FROM "TugConnection" WHERE id=connection_id);
END $$;
CREATE FUNCTION tug_presence_require_open(match_id uuid,user_id uuid) RETURNS timestamp LANGUAGE plpgsql AS $$
DECLARE t timestamp;
BEGIN
  t:=tug_presence_refresh(match_id);
  IF EXISTS(SELECT 1 FROM "PartidaTiraAfloja" WHERE id=match_id AND "presenciaVersion"=1) AND
    (NOT EXISTS(SELECT 1 FROM "TugConnection" WHERE "matchId"=match_id AND "userId"=user_id AND state='OPEN' AND "lastSeenAt"<=t AND "leaseUntil">t)
     OR NOT EXISTS(SELECT 1 FROM "Usuario" WHERE id=user_id AND rol='ESTUDIANTE' AND NOT "debeCambiarContrasena")
     OR EXISTS(SELECT 1 FROM "TugPresence" WHERE "matchId"=match_id AND "graceUntil"<=t)) THEN
    RAISE EXCEPTION 'TUG_PRESENCE_REQUIRED' USING ERRCODE='23514'; END IF;
  RETURN t;
END $$;
CREATE FUNCTION tug_presence_answer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM "PartidaTiraAfloja" WHERE id=NEW."partidaId" AND "presenciaVersion"=1) THEN
    PERFORM tug_presence_require_open(NEW."partidaId",NEW."usuarioId");
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tug_answers_aa_presence BEFORE INSERT ON "TiraAflojaRespuesta" FOR EACH ROW EXECUTE FUNCTION tug_presence_answer_guard();

ALTER TABLE "TugPresence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TugConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TugPresenceEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TugAbandonment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "TugPresence","TugConnection","TugPresenceEvent","TugAbandonment" FROM PUBLIC;
REVOKE ALL ON FUNCTION tug_presence_now(),tug_presence_lock(uuid),tug_presence_refresh(uuid,timestamp),tug_presence_connect(uuid,uuid,uuid,uuid,timestamp,timestamp),tug_presence_observe(uuid,uuid,uuid,text,timestamp),tug_presence_require_open(uuid,uuid),tug_presence_origin_guard(),tug_presence_answer_guard(),tug_presence_immutable(),tug_connection_guard() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON "TugPresence","TugConnection","TugPresenceEvent","TugAbandonment" FROM %I',r);
      EXECUTE format('REVOKE ALL ON FUNCTION tug_presence_now(),tug_presence_lock(uuid),tug_presence_refresh(uuid,timestamp),tug_presence_connect(uuid,uuid,uuid,uuid,timestamp,timestamp),tug_presence_observe(uuid,uuid,uuid,text,timestamp),tug_presence_require_open(uuid,uuid),tug_presence_origin_guard(),tug_presence_answer_guard(),tug_presence_immutable(),tug_connection_guard() FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMIT;
