-- C5 private metadata only. Bytes live in a private provider, never in this table.
CREATE TABLE "ArchivoPrivado" (
  id UUID PRIMARY KEY,
  "propietarioId" UUID NOT NULL REFERENCES "Usuario"(id) ON DELETE RESTRICT,
  "operacionId" UUID NOT NULL,
  proposito VARCHAR(32) NOT NULL,
  estado VARCHAR(16) NOT NULL DEFAULT 'PREPARADO',
  "revisionEsperada" INTEGER NOT NULL,
  "solicitudId" UUID REFERENCES "SolicitudAltaInstitucion"(id) ON DELETE RESTRICT,
  mime VARCHAR(32) NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiradoEn" TIMESTAMPTZ(3),
  "bytesRetiradosEn" TIMESTAMPTZ(3),
  CONSTRAINT "ArchivoPrivado_estado_check" CHECK (estado IN ('PREPARADO','ACTIVO','RETIRADO')),
  CONSTRAINT "ArchivoPrivado_revision_check" CHECK ("revisionEsperada" BETWEEN 0 AND 2147483646),
  CONSTRAINT "ArchivoPrivado_content_check" CHECK (
    bytes BETWEEN 1 AND 5242880 AND sha256 ~ '^[a-f0-9]{64}$' AND
    ((proposito='FOTO_PERFIL' AND "solicitudId" IS NULL AND mime='image/webp' AND bytes<=204800)
      OR (proposito='EVIDENCIA_INSTITUCIONAL' AND "solicitudId" IS NOT NULL AND mime IN ('image/webp','application/pdf')))
  ),
  CONSTRAINT "ArchivoPrivado_retirement_check" CHECK (
    (estado='RETIRADO')=("retiradoEn" IS NOT NULL) AND
    ("bytesRetiradosEn" IS NULL OR estado='RETIRADO')
  )
);
CREATE UNIQUE INDEX "ArchivoPrivado_propietarioId_operacionId_key" ON "ArchivoPrivado"("propietarioId","operacionId");
CREATE INDEX "ArchivoPrivado_propietarioId_proposito_estado_idx" ON "ArchivoPrivado"("propietarioId",proposito,estado);
CREATE INDEX "ArchivoPrivado_solicitudId_estado_idx" ON "ArchivoPrivado"("solicitudId",estado);
CREATE INDEX "ArchivoPrivado_estado_bytesRetiradosEn_idx" ON "ArchivoPrivado"(estado,"bytesRetiradosEn");
CREATE UNIQUE INDEX "ArchivoPrivado_foto_activa_key" ON "ArchivoPrivado"("propietarioId") WHERE proposito='FOTO_PERFIL' AND estado='ACTIVO';

CREATE TABLE "FotoPrivadaPerfil" (
  "usuarioId" UUID PRIMARY KEY REFERENCES "Usuario"(id) ON DELETE RESTRICT,
  "archivoId" UUID UNIQUE REFERENCES "ArchivoPrivado"(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0)
);

ALTER TABLE "ArchivoPrivado" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FotoPrivadaPerfil" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ArchivoPrivado", "FotoPrivadaPerfil" FROM PUBLIC;
DO $$ DECLARE client_role TEXT; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "ArchivoPrivado", "FotoPrivadaPerfil" FROM %I', client_role);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION sp_c5_private_file_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE live BOOLEAN;
BEGIN
  -- Same user lock as LIC-4: late writes cannot recreate private data after purge.
  SELECT ("suprimidaEn" IS NULL AND rol IS NOT NULL) INTO live
    FROM "Usuario" WHERE id=NEW."propietarioId" FOR UPDATE;
  IF NEW.estado<>'RETIRADO' AND live IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Private file owner unavailable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.id,NEW."propietarioId",NEW."operacionId",NEW.proposito,
      NEW."revisionEsperada",NEW."solicitudId",NEW.mime,NEW.bytes,NEW.sha256,NEW."creadoEn")
      IS DISTINCT FROM ROW(OLD.id,OLD."propietarioId",OLD."operacionId",OLD.proposito,
      OLD."revisionEsperada",OLD."solicitudId",OLD.mime,OLD.bytes,OLD.sha256,OLD."creadoEn") THEN
      RAISE EXCEPTION 'Private file identity is immutable' USING ERRCODE='23514';
    END IF;
    IF (OLD.estado='RETIRADO' AND NEW.estado<>'RETIRADO') OR
       (OLD.estado='ACTIVO' AND NEW.estado='PREPARADO') OR
       (OLD."bytesRetiradosEn" IS NOT NULL AND NEW."bytesRetiradosEn" IS DISTINCT FROM OLD."bytesRetiradosEn") THEN
      RAISE EXCEPTION 'Private file cannot be revived' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c5_private_file_guard BEFORE INSERT OR UPDATE ON "ArchivoPrivado"
  FOR EACH ROW EXECUTE FUNCTION sp_c5_private_file_guard();

CREATE FUNCTION sp_c5_private_profile_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE live BOOLEAN;
BEGIN
  SELECT ("suprimidaEn" IS NULL AND rol IS NOT NULL) INTO live
    FROM "Usuario" WHERE id=NEW."usuarioId" FOR UPDATE;
  IF live IS DISTINCT FROM TRUE OR (NEW."archivoId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "ArchivoPrivado" WHERE id=NEW."archivoId" AND "propietarioId"=NEW."usuarioId"
      AND proposito='FOTO_PERFIL' AND estado='ACTIVO'
  )) THEN
    RAISE EXCEPTION 'Private profile unavailable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (NEW."usuarioId"<>OLD."usuarioId" OR NEW.revision<>OLD.revision+1) THEN
    RAISE EXCEPTION 'Private profile requires a new revision' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c5_private_profile_guard BEFORE INSERT OR UPDATE ON "FotoPrivadaPerfil"
  FOR EACH ROW EXECUTE FUNCTION sp_c5_private_profile_guard();

CREATE FUNCTION sp_c5_private_purge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."suprimidaEn" IS NOT NULL AND OLD."suprimidaEn" IS NULL THEN
    DELETE FROM "FotoPrivadaPerfil" WHERE "usuarioId"=NEW.id;
    UPDATE "ArchivoPrivado" SET estado='RETIRADO',
      "retiradoEn"=COALESCE("retiradoEn",NEW."suprimidaEn"), "actualizadoEn"=NEW."suprimidaEn"
      WHERE "propietarioId"=NEW.id AND estado<>'RETIRADO';
    -- Physical bytes remain a pending cleanup receipt, never readable via account/API.
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c5_private_purge AFTER UPDATE OF "suprimidaEn" ON "Usuario"
  FOR EACH ROW EXECUTE FUNCTION sp_c5_private_purge();
