CREATE TABLE "SaldoPersonalInstitucional" (
  "id" UUID PRIMARY KEY,
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
  "asignacionId" UUID NOT NULL REFERENCES "AsignacionLicenciaInstitucional"("id") ON DELETE RESTRICT,
  "milisegundos" BIGINT NOT NULL CHECK ("milisegundos" > 0),
  "venceOriginal" TIMESTAMPTZ(3) NOT NULL,
  "guardadoEn" TIMESTAMPTZ(3) NOT NULL,
  "reanudadoEn" TIMESTAMPTZ(3),
  "venceReanudadoEn" TIMESTAMPTZ(3),
  CHECK (("reanudadoEn" IS NULL) = ("venceReanudadoEn" IS NULL)),
  CHECK ("venceOriginal" > "guardadoEn"),
  CHECK ("venceReanudadoEn" IS NULL OR "venceReanudadoEn" > "reanudadoEn")
);
CREATE UNIQUE INDEX "SaldoPersonalInstitucional_abierto_usuario" ON "SaldoPersonalInstitucional"("usuarioId") WHERE "reanudadoEn" IS NULL;
