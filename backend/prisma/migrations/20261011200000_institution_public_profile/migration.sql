-- No publicar mensajes de bienvenida existentes: pueden contener datos privados.
ALTER TABLE "Institucion"
ADD COLUMN "descripcionPublica" VARCHAR(500),
ADD COLUMN "revisionPerfil" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Institucion" ADD CONSTRAINT "Institucion_revisionPerfil_nonnegative"
CHECK ("revisionPerfil" >= 0);
