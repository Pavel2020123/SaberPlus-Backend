CREATE TYPE "EstadoInvitacionInstitucion" AS ENUM (
  'PENDIENTE',
  'ACEPTADA',
  'RECHAZADA',
  'CANCELADA',
  'EXPIRADA'
);

CREATE TABLE "InvitacionInstitucion" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "institucionId" UUID NOT NULL,
  "correo" VARCHAR(255) NOT NULL,
  "rol" "RolMembresiaInstitucion" NOT NULL DEFAULT 'PROFESOR',
  "estado" "EstadoInvitacionInstitucion" NOT NULL DEFAULT 'PENDIENTE',
  "creadoPorId" UUID NOT NULL,
  "aceptadoPorId" UUID,
  "fechaExpiracion" TIMESTAMP(6) NOT NULL,
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InvitacionInstitucion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditoriaInstitucion" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "institucionId" UUID NOT NULL,
  "accion" VARCHAR(60) NOT NULL,
  "actorId" UUID,
  "afectadoId" UUID,
  "detalle" JSONB,
  "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditoriaInstitucion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvitacionInstitucion_institucion_estado_fecha_idx"
  ON "InvitacionInstitucion"("institucionId", "estado", "fechaCreacion");
CREATE INDEX "InvitacionInstitucion_correo_estado_expiracion_idx"
  ON "InvitacionInstitucion"("correo", "estado", "fechaExpiracion");
CREATE UNIQUE INDEX "InvitacionInstitucion_pendiente_por_correo_key"
  ON "InvitacionInstitucion"("institucionId", LOWER("correo"))
  WHERE "estado" = 'PENDIENTE';
CREATE UNIQUE INDEX "MiembroInstitucion_un_propietario_key"
  ON "MiembroInstitucion"("institucionId")
  WHERE "rol" = 'PROPIETARIO';
CREATE INDEX "AuditoriaInstitucion_institucion_fecha_idx"
  ON "AuditoriaInstitucion"("institucionId", "fechaCreacion");
CREATE INDEX "AuditoriaInstitucion_actor_fecha_idx"
  ON "AuditoriaInstitucion"("actorId", "fechaCreacion");

ALTER TABLE "InvitacionInstitucion"
  ADD CONSTRAINT "InvitacionInstitucion_institucionId_fkey"
  FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvitacionInstitucion"
  ADD CONSTRAINT "InvitacionInstitucion_creadoPorId_fkey"
  FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvitacionInstitucion"
  ADD CONSTRAINT "InvitacionInstitucion_aceptadoPorId_fkey"
  FOREIGN KEY ("aceptadoPorId") REFERENCES "Usuario"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditoriaInstitucion"
  ADD CONSTRAINT "AuditoriaInstitucion_institucionId_fkey"
  FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditoriaInstitucion"
  ADD CONSTRAINT "AuditoriaInstitucion_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "Usuario"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditoriaInstitucion"
  ADD CONSTRAINT "AuditoriaInstitucion_afectadoId_fkey"
  FOREIGN KEY ("afectadoId") REFERENCES "Usuario"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
