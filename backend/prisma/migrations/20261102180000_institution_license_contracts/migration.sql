-- Additive LIC-1 storage. Does not opt in any existing institution.
CREATE TYPE "TipoCupoInstitucional" AS ENUM ('ESTUDIANTE', 'DOCENTE');
CREATE TYPE "EstadoAsignacionLicencia" AS ENUM ('PENDIENTE', 'ACTIVA', 'RETIRADA');

CREATE TABLE "ControlLicenciaInstitucional" (
  "institucionId" UUID PRIMARY KEY REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "suspendida" BOOLEAN NOT NULL DEFAULT false,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PeriodoContratoInstitucional" (
  "id" UUID PRIMARY KEY,
  "institucionId" UUID NOT NULL REFERENCES "ControlLicenciaInstitucional"("institucionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "inicio" TIMESTAMPTZ(3) NOT NULL,
  "fin" TIMESTAMPTZ(3) NOT NULL,
  "meses" INTEGER NOT NULL,
  "cuposEstudiantes" INTEGER NOT NULL,
  "cuposDocentes" INTEGER NOT NULL,
  "referenciaAcuerdo" VARCHAR(255) NOT NULL,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PeriodoContrato_fechas_check" CHECK ("inicio" < "fin"),
  CONSTRAINT "PeriodoContrato_meses_check" CHECK ("meses" IN (6, 12, 18, 24)),
  CONSTRAINT "PeriodoContrato_cupos_check" CHECK ("cuposEstudiantes" >= 0 AND "cuposDocentes" >= 0),
  CONSTRAINT "PeriodoContrato_referencia_check" CHECK (length(btrim("referenciaAcuerdo")) > 0)
);
CREATE UNIQUE INDEX "PeriodoContratoInstitucional_institucionId_inicio_key" ON "PeriodoContratoInstitucional"("institucionId", "inicio");
CREATE INDEX "PeriodoContratoInstitucional_institucionId_fin_idx" ON "PeriodoContratoInstitucional"("institucionId", "fin");

CREATE TABLE "AsignacionLicenciaInstitucional" (
  "id" UUID PRIMARY KEY,
  "institucionId" UUID NOT NULL REFERENCES "ControlLicenciaInstitucional"("institucionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "tipo" "TipoCupoInstitucional" NOT NULL,
  "estado" "EstadoAsignacionLicencia" NOT NULL DEFAULT 'PENDIENTE',
  "aceptadaEn" TIMESTAMPTZ(3),
  "retiradaEn" TIMESTAMPTZ(3),
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AsignacionLicencia_estado_check" CHECK (
    ("estado" = 'PENDIENTE' AND "aceptadaEn" IS NULL AND "retiradaEn" IS NULL)
    OR ("estado" = 'ACTIVA' AND "aceptadaEn" IS NOT NULL AND "retiradaEn" IS NULL)
    OR ("estado" = 'RETIRADA' AND "retiradaEn" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "AsignacionLicenciaInstitucional_institucionId_usuarioId_key" ON "AsignacionLicenciaInstitucional"("institucionId", "usuarioId");
CREATE INDEX "AsignacionLicenciaInstitucional_institucionId_estado_tipo_idx" ON "AsignacionLicenciaInstitucional"("institucionId", "estado", "tipo");
-- A person cannot consume active seats at two institutions concurrently.
CREATE UNIQUE INDEX "AsignacionLicencia_usuario_activo_key" ON "AsignacionLicenciaInstitucional"("usuarioId") WHERE "estado" = 'ACTIVA';

CREATE TABLE "OrigenGestionadoInstitucional" (
  "usuarioId" UUID PRIMARY KEY REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "institucionId" UUID NOT NULL REFERENCES "ControlLicenciaInstitucional"("institucionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "OperacionLicenciaInstitucional" (
  "id" UUID PRIMARY KEY,
  "institucionId" UUID NOT NULL REFERENCES "ControlLicenciaInstitucional"("institucionId") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "tipo" VARCHAR(40) NOT NULL,
  "huella" VARCHAR(64) NOT NULL,
  "resultado" JSONB NOT NULL,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperacionLicencia_huella_check" CHECK ("huella" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "OperacionLicenciaInstitucional_institucionId_creadoEn_idx" ON "OperacionLicenciaInstitucional"("institucionId", "creadoEn");
