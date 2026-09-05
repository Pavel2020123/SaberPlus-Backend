CREATE TYPE "EstadoContenido" AS ENUM (
  'BORRADOR',
  'EN_REVISION',
  'PUBLICADO',
  'ARCHIVADO'
);

ALTER TABLE "Tema"
ADD COLUMN "estadoContenido" "EstadoContenido" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN "fechaPublicacion" TIMESTAMP(6),
ADD COLUMN "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Subtema"
ADD COLUMN "estadoContenido" "EstadoContenido" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN "fechaPublicacion" TIMESTAMP(6),
ADD COLUMN "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Pregunta"
ADD COLUMN "estadoContenido" "EstadoContenido" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN "fechaPublicacion" TIMESTAMP(6),
ADD COLUMN "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "CasoPregunta"
ADD COLUMN "estadoContenido" "EstadoContenido" NOT NULL DEFAULT 'BORRADOR',
ADD COLUMN "fechaPublicacion" TIMESTAMP(6),
ADD COLUMN "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- El contenido previo requiere revisión explícita antes de publicarse en la app.
UPDATE "Tema" SET "estadoContenido" = 'ARCHIVADO';
UPDATE "Subtema" SET "estadoContenido" = 'ARCHIVADO';
UPDATE "Pregunta" SET "estadoContenido" = 'ARCHIVADO';
UPDATE "CasoPregunta" SET "estadoContenido" = 'ARCHIVADO';

CREATE INDEX "Tema_estadoContenido_area_idx"
ON "Tema"("estadoContenido", "area");

CREATE INDEX "Subtema_estadoContenido_temaId_idx"
ON "Subtema"("estadoContenido", "temaId");

CREATE INDEX "Pregunta_estadoContenido_subtemaId_idx"
ON "Pregunta"("estadoContenido", "subtemaId");

CREATE INDEX "CasoPregunta_estadoContenido_area_idx"
ON "CasoPregunta"("estadoContenido", "area");
