-- Additive migration: never infer DIVIPOLA from free text or modify approval.
ALTER TABLE "Institucion"
  ADD COLUMN "departamentoCodigo" VARCHAR(2),
  ADD COLUMN "municipioCodigo" VARCHAR(5),
  ADD COLUMN "territorioVersion" VARCHAR(64);
ALTER TABLE "SolicitudAltaInstitucion"
  ADD COLUMN "departamentoCodigo" VARCHAR(2),
  ADD COLUMN "municipioCodigo" VARCHAR(5),
  ADD COLUMN "territorioVersion" VARCHAR(64);

-- Membership in the versioned official catalog is validated by the service.
-- SQL additionally prevents partial tuples, malformed codes and wrong prefixes.
ALTER TABLE "Institucion" ADD CONSTRAINT "Institucion_territorio_completo_check" CHECK (
  ("departamentoCodigo" IS NULL AND "municipioCodigo" IS NULL AND "territorioVersion" IS NULL)
  OR ("departamentoCodigo" IS NOT NULL AND "municipioCodigo" IS NOT NULL
    AND "territorioVersion" IS NOT NULL AND length("territorioVersion") > 0
    AND "departamentoCodigo" ~ '^[0-9]{2}$' AND "municipioCodigo" ~ '^[0-9]{5}$'
    AND left("municipioCodigo", 2) = "departamentoCodigo")
);
ALTER TABLE "SolicitudAltaInstitucion" ADD CONSTRAINT "SolicitudAltaInstitucion_territorio_completo_check" CHECK (
  ("departamentoCodigo" IS NULL AND "municipioCodigo" IS NULL AND "territorioVersion" IS NULL)
  OR ("departamentoCodigo" IS NOT NULL AND "municipioCodigo" IS NOT NULL
    AND "territorioVersion" IS NOT NULL AND length("territorioVersion") > 0
    AND "departamentoCodigo" ~ '^[0-9]{2}$' AND "municipioCodigo" ~ '^[0-9]{5}$'
    AND left("municipioCodigo", 2) = "departamentoCodigo")
);
CREATE INDEX "Institucion_territorio_idx"
  ON "Institucion"("estadoVerificacion", "departamentoCodigo", "municipioCodigo");
-- Existing RLS policies and grants are unchanged; no new direct-access grants.
