CREATE TYPE "EstadoAltaInstitucion" AS ENUM ('PENDIENTE', 'REQUIERE_INFORMACION', 'APROBADA', 'RECHAZADA', 'SUSPENDIDA', 'LEGADO_EN_REVISION');
ALTER TABLE "Institucion" ADD COLUMN "estadoVerificacion" "EstadoAltaInstitucion" NOT NULL DEFAULT 'PENDIENTE', ADD COLUMN "transicionHasta" TIMESTAMP(3);
-- Solo las instituciones que ya existen reciben una transición visible de 30 días.
-- No equivale a una aprobación. Revisar la fecha de despliegue antes de aplicar.
UPDATE "Institucion" SET "estadoVerificacion" = 'LEGADO_EN_REVISION', "transicionHasta" = CURRENT_TIMESTAMP + INTERVAL '30 days';
CREATE TABLE "SolicitudAltaInstitucion" (
  "id" UUID NOT NULL,
  "solicitanteId" UUID,
  "institucionId" UUID,
  "nombre" VARCHAR(120) NOT NULL,
  "nombreNormalizado" VARCHAR(120) NOT NULL,
  "ciudad" VARCHAR(120) NOT NULL,
  "ciudadNormalizada" VARCHAR(120) NOT NULL,
  "correoInstitucional" VARCHAR(254) NOT NULL,
  "contacto" VARCHAR(120) NOT NULL,
  "referenciaUrl" VARCHAR(500),
  "evidencia" VARCHAR(2000) NOT NULL,
  "estado" "EstadoAltaInstitucion" NOT NULL DEFAULT 'PENDIENTE',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "mensajeSolicitante" VARCHAR(1000) NOT NULL DEFAULT '',
  "historial" JSONB NOT NULL DEFAULT '[]',
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SolicitudAltaInstitucion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SolicitudAltaInstitucion_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "SolicitudAltaInstitucion_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SolicitudAltaInstitucion_institucionId_fkey" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SolicitudAltaInstitucion_solicitanteId_key" ON "SolicitudAltaInstitucion"("solicitanteId");
CREATE UNIQUE INDEX "SolicitudAltaInstitucion_institucionId_key" ON "SolicitudAltaInstitucion"("institucionId");
CREATE INDEX "SolicitudAltaInstitucion_estado_actualizadoEn_idx" ON "SolicitudAltaInstitucion"("estado", "actualizadoEn");
CREATE INDEX "SolicitudAltaInstitucion_nombreNormalizado_ciudadNormalizada_idx" ON "SolicitudAltaInstitucion"("nombreNormalizado", "ciudadNormalizada");
INSERT INTO "SolicitudAltaInstitucion" ("id", "solicitanteId", "institucionId", "nombre", "nombreNormalizado", "ciudad", "ciudadNormalizada", "correoInstitucional", "contacto", "evidencia", "estado", "mensajeSolicitante")
SELECT gen_random_uuid(), propietario."usuarioId", i."id", left(i."nombre",120), lower(translate(regexp_replace(trim(left(i."nombre",120)), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '', '', '', '', 'Institución anterior al flujo de verificación. Requiere revisión de ADMIN.', 'LEGADO_EN_REVISION', 'Tu institución tiene una revisión pendiente. Contacta al equipo de SaberPlus antes de finalizar el plazo de transición.'
FROM "Institucion" i
LEFT JOIN LATERAL (SELECT m."usuarioId" FROM "MiembroInstitucion" m WHERE m."institucionId" = i."id" AND m."rol" = 'PROPIETARIO' ORDER BY m."usuarioId" LIMIT 1) propietario ON true;
