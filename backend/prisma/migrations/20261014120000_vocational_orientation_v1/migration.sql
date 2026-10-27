-- Private declared-interest attempts. No academic or competitive data changes.
CREATE TYPE "EstadoIntentoVocacional" AS ENUM ('EN_PROGRESO', 'COMPLETADO');
CREATE TABLE "IntentoVocacional" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "rulesVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("rulesVersion" > 0),
  "estado" "EstadoIntentoVocacional" NOT NULL DEFAULT 'EN_PROGRESO',
  "iniciadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completadoEn" TIMESTAMPTZ(3),
  "resultado" JSONB,
  CONSTRAINT "IntentoVocacional_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ov1_terminal_coherente" CHECK (
    ("estado" = 'EN_PROGRESO' AND "completadoEn" IS NULL AND "resultado" IS NULL) OR
    ("estado" = 'COMPLETADO' AND "completadoEn" IS NOT NULL AND "resultado" IS NOT NULL AND jsonb_typeof("resultado") = 'object')),
  CONSTRAINT "ov1_fechas_coherentes" CHECK (
    "actualizadoEn" >= "iniciadoEn" AND ("completadoEn" IS NULL OR "completadoEn" >= "iniciadoEn"))
);
CREATE INDEX "IntentoVocacional_usuarioId_iniciadoEn_id_idx" ON "IntentoVocacional" ("usuarioId", "iniciadoEn", "id");
-- Prisma cannot express this partial unique index.
CREATE UNIQUE INDEX "ov1_un_activo_por_usuario" ON "IntentoVocacional" ("usuarioId") WHERE "estado" = 'EN_PROGRESO';
CREATE TABLE "RespuestaVocacional" (
  "intentoId" UUID NOT NULL REFERENCES "IntentoVocacional"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "preguntaId" VARCHAR(2) NOT NULL CHECK ("preguntaId" ~ '^[TSCNHD][1-5]$'),
  "valor" VARCHAR(5) NOT NULL CHECK ("valor" IN ('0','1','2','3','4','NO_SE')),
  CONSTRAINT "RespuestaVocacional_pkey" PRIMARY KEY ("intentoId", "preguntaId")
);

CREATE FUNCTION ov1_intento_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."estado" <> 'EN_PROGRESO' OR NEW."rulesVersion" <> 1 THEN
      RAISE EXCEPTION 'OV1_INVALID_INITIAL_ATTEMPT' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF OLD."estado" = 'COMPLETADO' OR NEW."id" <> OLD."id" OR
       NEW."usuarioId" <> OLD."usuarioId" OR NEW."rulesVersion" <> OLD."rulesVersion" OR
       NEW."iniciadoEn" <> OLD."iniciadoEn" THEN
      RAISE EXCEPTION 'OV1_IMMUTABLE_ATTEMPT' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ov1_intento_guard BEFORE INSERT OR UPDATE ON "IntentoVocacional"
FOR EACH ROW EXECUTE FUNCTION ov1_intento_guard();

CREATE FUNCTION ov1_respuesta_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target UUID; state "EstadoIntentoVocacional";
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD."intentoId"; ELSE target := NEW."intentoId"; END IF;
  IF TG_OP = 'UPDATE' AND (NEW."intentoId" <> OLD."intentoId" OR NEW."preguntaId" <> OLD."preguntaId") THEN
    RAISE EXCEPTION 'OV1_IMMUTABLE_RESPONSE_ID' USING ERRCODE = '23514';
  END IF;
  SELECT "estado" INTO state FROM "IntentoVocacional" WHERE id = target FOR UPDATE;
  -- Owner deletion of the parent must cascade even for completed attempts.
  IF state = 'COMPLETADO' THEN
    RAISE EXCEPTION 'OV1_IMMUTABLE_RESPONSE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER ov1_respuesta_guard BEFORE INSERT OR UPDATE OR DELETE ON "RespuestaVocacional"
FOR EACH ROW EXECUTE FUNCTION ov1_respuesta_guard();

ALTER TABLE "IntentoVocacional" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RespuestaVocacional" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "IntentoVocacional", "RespuestaVocacional" FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON "IntentoVocacional", "RespuestaVocacional" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
