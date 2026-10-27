CREATE TABLE "SolicitudIngresoEstudiante" (
  "id" UUID PRIMARY KEY,
  "institucionId" UUID NOT NULL REFERENCES "Institucion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "estudianteId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "estado" "EstadoSolicitudIngresoInstitucion" NOT NULL DEFAULT 'PENDIENTE',
  "mensaje" VARCHAR(500),
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "revisadoPorId" UUID REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SolicitudIngresoEstudiante_pendiente_unique"
  ON "SolicitudIngresoEstudiante"("estudianteId") WHERE "estado" = 'PENDIENTE';
CREATE INDEX "SolicitudIngresoEstudiante_estudianteId_fechaCreacion_id_idx"
  ON "SolicitudIngresoEstudiante"("estudianteId", "fechaCreacion", "id");
CREATE INDEX "SolicitudIngresoEstudiante_institucionId_estado_fechaCreacion_id_idx"
  ON "SolicitudIngresoEstudiante"("institucionId", "estado", "fechaCreacion", "id");
ALTER TABLE "SolicitudIngresoEstudiante" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SolicitudIngresoEstudiante" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "SolicitudIngresoEstudiante" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "SolicitudIngresoEstudiante" FROM authenticated;
  END IF;
END $$;
