ALTER TABLE "ClaseEstudiante"
  ADD COLUMN "codigoTemporalId" UUID,
  ADD COLUMN "aceptacionExplicita" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "fechaIngreso" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "ClaseProfesor" (
  "claseId" UUID NOT NULL,
  "miembroId" UUID NOT NULL,
  "fechaAsignacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClaseProfesor_pkey" PRIMARY KEY ("claseId", "miembroId")
);

CREATE TABLE "CodigoTemporalGrupo" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "claseId" UUID NOT NULL,
  "codigoHash" VARCHAR(64) NOT NULL,
  "sufijo" VARCHAR(4) NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "usos" INTEGER NOT NULL DEFAULT 0,
  "usosMaximos" INTEGER NOT NULL,
  "fechaExpiracion" TIMESTAMP(6) NOT NULL,
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "creadoPorId" UUID NOT NULL,

  CONSTRAINT "CodigoTemporalGrupo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CodigoTemporalGrupo_usos_check"
    CHECK ("usos" >= 0 AND "usosMaximos" >= 1 AND "usos" <= "usosMaximos")
);

CREATE UNIQUE INDEX "CodigoTemporalGrupo_codigoHash_key"
  ON "CodigoTemporalGrupo"("codigoHash");
CREATE INDEX "CodigoTemporalGrupo_clase_activo_expira_idx"
  ON "CodigoTemporalGrupo"("claseId", "activo", "fechaExpiracion");
CREATE INDEX "CodigoTemporalGrupo_creador_fecha_idx"
  ON "CodigoTemporalGrupo"("creadoPorId", "fechaCreacion");
CREATE INDEX "ClaseProfesor_miembro_fecha_idx"
  ON "ClaseProfesor"("miembroId", "fechaAsignacion");
CREATE INDEX "ClaseEstudiante_codigoTemporalId_idx"
  ON "ClaseEstudiante"("codigoTemporalId");

ALTER TABLE "ClaseProfesor"
  ADD CONSTRAINT "ClaseProfesor_claseId_fkey"
  FOREIGN KEY ("claseId") REFERENCES "Clase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaseProfesor"
  ADD CONSTRAINT "ClaseProfesor_miembroId_fkey"
  FOREIGN KEY ("miembroId") REFERENCES "MiembroInstitucion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodigoTemporalGrupo"
  ADD CONSTRAINT "CodigoTemporalGrupo_claseId_fkey"
  FOREIGN KEY ("claseId") REFERENCES "Clase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodigoTemporalGrupo"
  ADD CONSTRAINT "CodigoTemporalGrupo_creadoPorId_fkey"
  FOREIGN KEY ("creadoPorId") REFERENCES "MiembroInstitucion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClaseEstudiante"
  ADD CONSTRAINT "ClaseEstudiante_codigoTemporalId_fkey"
  FOREIGN KEY ("codigoTemporalId") REFERENCES "CodigoTemporalGrupo"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Los grupos existentes quedan administrables por su propietario institucional.
INSERT INTO "ClaseProfesor" ("claseId", "miembroId")
SELECT clase."id", miembro."id"
FROM "Clase" AS clase
JOIN "MiembroInstitucion" AS miembro
  ON miembro."institucionId" = clase."institucionId"
 AND miembro."rol" = 'PROPIETARIO'
ON CONFLICT DO NOTHING;
