CREATE TABLE "SufijoInstitucional" (
  "institucionId" UUID PRIMARY KEY REFERENCES "ControlLicenciaInstitucional"("institucionId") ON DELETE RESTRICT,
  "solicitado" VARCHAR(189) NOT NULL CHECK ("solicitado" = lower(trim("solicitado")) AND "solicitado" <> ''),
  "aprobado" VARCHAR(189) UNIQUE,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "solicitadoEn" TIMESTAMPTZ(3) NOT NULL,
  "aprobadoEn" TIMESTAMPTZ(3),
  CHECK (("aprobado" IS NULL) = ("aprobadoEn" IS NULL)),
  CHECK ("aprobado" IS NULL OR "aprobado" = "solicitado")
);
