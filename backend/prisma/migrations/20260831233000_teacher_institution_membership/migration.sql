-- CreateEnum
CREATE TYPE "RolMembresiaInstitucion" AS ENUM ('PROPIETARIO', 'ADMINISTRADOR', 'PROFESOR');

-- CreateEnum
CREATE TYPE "EstadoSolicitudIngresoInstitucion" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "MiembroInstitucion" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "institucionId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "rol" "RolMembresiaInstitucion" NOT NULL DEFAULT 'PROFESOR',
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiembroInstitucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitudIngresoInstitucion" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "institucionId" UUID NOT NULL,
    "solicitanteId" UUID NOT NULL,
    "estado" "EstadoSolicitudIngresoInstitucion" NOT NULL DEFAULT 'PENDIENTE',
    "mensaje" VARCHAR(500),
    "revisadoPorId" UUID,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitudIngresoInstitucion_pkey" PRIMARY KEY ("id")
);

-- Backfill memberships for existing teachers and platform administrators.
WITH miembros_existentes AS (
    SELECT
        u."id" AS "usuarioId",
        u."institucionId",
        u."rol",
        ROW_NUMBER() OVER (
            PARTITION BY u."institucionId"
            ORDER BY u."fechaCreacion" ASC NULLS LAST, u."id" ASC
        ) AS posicion
    FROM "Usuario" u
    WHERE u."institucionId" IS NOT NULL
      AND u."rol" IN ('PROFESOR', 'ADMIN')
)
INSERT INTO "MiembroInstitucion" ("institucionId", "usuarioId", "rol")
SELECT
    "institucionId",
    "usuarioId",
    CASE
        WHEN posicion = 1 THEN 'PROPIETARIO'::"RolMembresiaInstitucion"
        WHEN "rol" = 'ADMIN' THEN 'ADMINISTRADOR'::"RolMembresiaInstitucion"
        ELSE 'PROFESOR'::"RolMembresiaInstitucion"
    END
FROM miembros_existentes;

-- CreateIndex
CREATE UNIQUE INDEX "MiembroInstitucion_usuarioId_key" ON "MiembroInstitucion"("usuarioId");
CREATE UNIQUE INDEX "MiembroInstitucion_institucionId_usuarioId_key" ON "MiembroInstitucion"("institucionId", "usuarioId");
CREATE INDEX "MiembroInstitucion_institucionId_rol_idx" ON "MiembroInstitucion"("institucionId", "rol");
CREATE INDEX "SolicitudIngresoInstitucion_institucionId_estado_fechaCreacion_idx" ON "SolicitudIngresoInstitucion"("institucionId", "estado", "fechaCreacion");
CREATE INDEX "SolicitudIngresoInstitucion_solicitanteId_estado_fechaCreacion_idx" ON "SolicitudIngresoInstitucion"("solicitanteId", "estado", "fechaCreacion");
CREATE UNIQUE INDEX "SolicitudIngresoInstitucion_solicitante_pendiente_key" ON "SolicitudIngresoInstitucion"("solicitanteId") WHERE "estado" = 'PENDIENTE';

-- AddForeignKey
ALTER TABLE "MiembroInstitucion" ADD CONSTRAINT "MiembroInstitucion_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MiembroInstitucion" ADD CONSTRAINT "MiembroInstitucion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolicitudIngresoInstitucion" ADD CONSTRAINT "SolicitudIngresoInstitucion_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolicitudIngresoInstitucion" ADD CONSTRAINT "SolicitudIngresoInstitucion_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolicitudIngresoInstitucion" ADD CONSTRAINT "SolicitudIngresoInstitucion_revisadoPorId_fkey" FOREIGN KEY ("revisadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
