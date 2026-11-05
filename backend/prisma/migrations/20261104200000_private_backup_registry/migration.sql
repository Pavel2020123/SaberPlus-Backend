-- Local C5 operator registry. No bytes, keys, customer-facing endpoint or grants.
CREATE TABLE "RespaldoArchivoPrivado" (
  "archivoId" UUID PRIMARY KEY REFERENCES "ArchivoPrivado"(id) ON DELETE RESTRICT,
  "vaultId" UUID NOT NULL,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiradoEn" TIMESTAMPTZ(3),
  "eliminadoEn" TIMESTAMPTZ(3),
  CONSTRAINT "RespaldoArchivoPrivado_retirement_check" CHECK (
    "eliminadoEn" IS NULL OR "retiradoEn" IS NOT NULL
  )
);
CREATE INDEX "RespaldoArchivoPrivado_retiradoEn_eliminadoEn_archivoId_idx"
  ON "RespaldoArchivoPrivado"("retiradoEn", "eliminadoEn", "archivoId");
ALTER TABLE "RespaldoArchivoPrivado" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "RespaldoArchivoPrivado" FROM PUBLIC;
DO $$ DECLARE client_role TEXT; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "RespaldoArchivoPrivado" FROM %I', client_role);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION sp_c5_private_backup_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_state TEXT; owner_id UUID;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Private backup receipt is immutable' USING ERRCODE='23514';
  END IF;
  SELECT "propietarioId" INTO owner_id FROM "ArchivoPrivado" WHERE id=NEW."archivoId";
  PERFORM id FROM "Usuario" WHERE id=owner_id FOR UPDATE;
  SELECT estado INTO source_state FROM "ArchivoPrivado" WHERE id=NEW."archivoId" FOR UPDATE;
  IF TG_OP='INSERT' THEN
    IF source_state IS DISTINCT FROM 'ACTIVO' OR NEW."retiradoEn" IS NOT NULL OR NEW."eliminadoEn" IS NOT NULL THEN
      RAISE EXCEPTION 'Only active private files can register a backup' USING ERRCODE='23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "ArchivoPrivado" f JOIN LATERAL (
        SELECT "venceEn" FROM "ResolucionEvidenciaInstitucional" r
        WHERE r."solicitudId"=f."solicitudId" AND r.revision>f."revisionEsperada"
        ORDER BY r.revision LIMIT 1
      ) deadline ON TRUE
      WHERE f.id=NEW."archivoId" AND deadline."venceEn"<=clock_timestamp()
    ) THEN
      RAISE EXCEPTION 'Expired private evidence cannot register a backup' USING ERRCODE='23514';
    END IF;
    NEW."creadoEn"=date_trunc('milliseconds',clock_timestamp());
  ELSE
    IF ROW(NEW."archivoId",NEW."vaultId",NEW."creadoEn") IS DISTINCT FROM ROW(OLD."archivoId",OLD."vaultId",OLD."creadoEn") OR
      (OLD."retiradoEn" IS NOT NULL AND NEW."retiradoEn" IS DISTINCT FROM OLD."retiradoEn") OR
      (OLD."eliminadoEn" IS NOT NULL AND NEW."eliminadoEn" IS DISTINCT FROM OLD."eliminadoEn") THEN
      RAISE EXCEPTION 'Private backup cannot be revived or reassigned' USING ERRCODE='23514';
    END IF;
    IF NEW."retiradoEn" IS NOT NULL AND source_state IS DISTINCT FROM 'RETIRADO' THEN
      RAISE EXCEPTION 'Backup retirement requires file retirement' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c5_private_backup_guard BEFORE INSERT OR UPDATE OR DELETE ON "RespaldoArchivoPrivado"
  FOR EACH ROW EXECUTE FUNCTION sp_c5_private_backup_guard();

CREATE FUNCTION sp_c5_private_backup_retire() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado='RETIRADO' AND OLD.estado<>'RETIRADO' THEN
    UPDATE "RespaldoArchivoPrivado" SET "retiradoEn"=date_trunc('milliseconds',clock_timestamp())
      WHERE "archivoId"=NEW.id AND "retiradoEn" IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c5_private_backup_retire AFTER UPDATE OF estado ON "ArchivoPrivado"
  FOR EACH ROW EXECUTE FUNCTION sp_c5_private_backup_retire();
