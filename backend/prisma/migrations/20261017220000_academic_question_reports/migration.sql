CREATE TYPE "MotivoReportePregunta" AS ENUM ('ENUNCIADO_CONFUSO', 'RESPUESTA_INCORRECTA', 'EXPLICACION_INCORRECTA', 'IMAGEN_NO_CARGA', 'OTRO');
CREATE TYPE "EstadoReportePregunta" AS ENUM ('PENDIENTE', 'EN_REVISION', 'RESUELTO', 'DESCARTADO');
CREATE TYPE "TipoOperacionReportePregunta" AS ENUM ('CREAR', 'DECIDIR');

CREATE TABLE "ReportePregunta" (
  "id" UUID PRIMARY KEY,
  "autorId" UUID REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "preguntaId" TEXT NOT NULL REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "motivo" "MotivoReportePregunta" NOT NULL,
  "detalle" VARCHAR(500),
  "areaCapturada" "AreaIcfes" NOT NULL,
  "subtemaIdCapturado" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "estado" "EstadoReportePregunta" NOT NULL DEFAULT 'PENDIENTE',
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "fechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaActualizacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ReportePregunta_autorId_preguntaId_motivo_key" ON "ReportePregunta"("autorId", "preguntaId", "motivo");
CREATE INDEX "ReportePregunta_preguntaId_idx" ON "ReportePregunta"("preguntaId");
CREATE INDEX "ReportePregunta_autorId_fechaCreacion_id_idx" ON "ReportePregunta"("autorId", "fechaCreacion", "id");
CREATE INDEX "ReportePregunta_estado_fechaCreacion_id_idx" ON "ReportePregunta"("estado", "fechaCreacion", "id");
CREATE INDEX "ReportePregunta_areaCapturada_estado_fechaCreacion_id_idx" ON "ReportePregunta"("areaCapturada", "estado", "fechaCreacion", "id");
CREATE INDEX "ReportePregunta_subtemaIdCapturado_estado_idx" ON "ReportePregunta"("subtemaIdCapturado", "estado");

CREATE TABLE "OperacionReportePregunta" (
  "id" UUID PRIMARY KEY,
  "actorId" UUID REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "reporteId" UUID NOT NULL REFERENCES "ReportePregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "tipo" "TipoOperacionReportePregunta" NOT NULL,
  "huellaSolicitud" CHAR(64) NOT NULL CHECK ("huellaSolicitud" ~ '^[a-f0-9]{64}$'),
  "resultado" JSONB NOT NULL,
  "fechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OperacionReportePregunta_actorId_fechaCreacion_idx" ON "OperacionReportePregunta"("actorId", "fechaCreacion");
CREATE INDEX "OperacionReportePregunta_reporteId_idx" ON "OperacionReportePregunta"("reporteId");

CREATE TABLE "AuditoriaReportePregunta" (
  "id" UUID PRIMARY KEY,
  "reporteId" UUID NOT NULL REFERENCES "ReportePregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" UUID REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "estadoAnterior" "EstadoReportePregunta",
  "estadoNuevo" "EstadoReportePregunta" NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" >= 0),
  "motivoRevision" VARCHAR(500),
  "fechaCreacion" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditoriaReportePregunta_reporteId_revision_key" UNIQUE ("reporteId", "revision")
);
CREATE TABLE "TasaReportePregunta" (
  "usuarioId" UUID PRIMARY KEY REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "inicio" TIMESTAMPTZ(3) NOT NULL,
  "solicitudes" INTEGER NOT NULL CHECK ("solicitudes" > 0)
);

ALTER TABLE "ReportePregunta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OperacionReportePregunta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditoriaReportePregunta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TasaReportePregunta" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ReportePregunta", "OperacionReportePregunta", "AuditoriaReportePregunta", "TasaReportePregunta" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "ReportePregunta", "OperacionReportePregunta", "AuditoriaReportePregunta", "TasaReportePregunta" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "ReportePregunta", "OperacionReportePregunta", "AuditoriaReportePregunta", "TasaReportePregunta" FROM authenticated;
  END IF;
END $$;
