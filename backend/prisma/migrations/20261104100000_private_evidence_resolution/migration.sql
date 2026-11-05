-- C5: immutable resolution clocks. No bytes, names or contact details here.
-- This does not grant access to an attachment; the private API must authorize
-- each read and enforce its deadline even while physical cleanup is unavailable.
CREATE TABLE "ResolucionEvidenciaInstitucional" (
  "solicitudId" UUID NOT NULL REFERENCES "SolicitudAltaInstitucion"(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  estado VARCHAR(16) NOT NULL CHECK (estado IN ('APROBADA','RECHAZADA')),
  "resueltaEn" TIMESTAMPTZ(3) NOT NULL,
  "venceEn" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("solicitudId", revision),
  CHECK ("venceEn" = "resueltaEn" + INTERVAL '2160 hours')
);
CREATE INDEX "ResolucionEvidenciaInstitucional_venceEn_idx"
  ON "ResolucionEvidenciaInstitucional"("venceEn");
ALTER TABLE "ResolucionEvidenciaInstitucional" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ResolucionEvidenciaInstitucional" FROM PUBLIC;
DO $$ DECLARE client_role TEXT; BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE "ResolucionEvidenciaInstitucional" FROM %I', client_role);
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION sp_c5_evidence_resolution_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Evidence resolution clocks are immutable' USING ERRCODE='23514';
END $$;
CREATE TRIGGER c5_evidence_resolution_immutable
  BEFORE UPDATE OR DELETE ON "ResolucionEvidenciaInstitucional"
  FOR EACH ROW EXECUTE FUNCTION sp_c5_evidence_resolution_immutable();

CREATE FUNCTION sp_c5_capture_evidence_resolution() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resolved TIMESTAMPTZ(3);
BEGIN
  -- A location correction, suspension or reactivation is not a new review cycle.
  -- Rejected requests may be resubmitted; old files keep their FIRST subsequent
  -- resolution, while files reserved in the new revision use the next one.
  IF NEW.estado::text IN ('APROBADA','RECHAZADA') AND
     (TG_OP='INSERT' OR OLD.estado::text IN
       ('PENDIENTE','REQUIERE_INFORMACION','LEGADO_EN_REVISION')) THEN
    IF TG_OP='UPDATE' AND NEW.revision <= OLD.revision THEN
      RAISE EXCEPTION 'Evidence resolution requires a new revision' USING ERRCODE='23514';
    END IF;
    resolved := clock_timestamp();
    INSERT INTO "ResolucionEvidenciaInstitucional"
      ("solicitudId",revision,estado,"resueltaEn","venceEn")
      VALUES (NEW.id,NEW.revision,NEW.estado::text,resolved,resolved+INTERVAL '2160 hours');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c5_capture_evidence_resolution
  AFTER INSERT OR UPDATE OF estado,revision ON "SolicitudAltaInstitucion"
  FOR EACH ROW EXECUTE FUNCTION sp_c5_capture_evidence_resolution();

-- No historical timestamp is invented for already-final requests. This is an
-- additive local-only increment preceding the first evidence-upload endpoint.
