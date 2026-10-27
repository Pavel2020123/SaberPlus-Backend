CREATE TABLE "CodigoIngresoEstudiantil" (
  "institucionId" UUID PRIMARY KEY REFERENCES "Institucion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "codigo" VARCHAR(36) NOT NULL UNIQUE CHECK ("codigo" ~ '^SPI-[A-F0-9]{32}$'),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "operacionId" UUID NOT NULL,
  "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "IngresoInstitucionCodigo" (
  "id" UUID PRIMARY KEY,
  "institucionId" UUID NOT NULL REFERENCES "Institucion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "estudianteId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "codigoHash" CHAR(64) NOT NULL CHECK ("codigoHash" ~ '^[a-f0-9]{64}$'),
  "revisionCodigo" INTEGER NOT NULL CHECK ("revisionCodigo" > 0),
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "IngresoInstitucionCodigo_estudianteId_fechaCreacion_idx"
  ON "IngresoInstitucionCodigo"("estudianteId", "fechaCreacion");
ALTER TABLE "CodigoIngresoEstudiantil" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IngresoInstitucionCodigo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CodigoIngresoEstudiantil", "IngresoInstitucionCodigo" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "CodigoIngresoEstudiantil", "IngresoInstitucionCodigo" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "CodigoIngresoEstudiantil", "IngresoInstitucionCodigo" FROM authenticated;
  END IF;
END $$;
