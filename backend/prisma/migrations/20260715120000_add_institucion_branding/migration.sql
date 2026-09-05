-- Add institution branding fields to Institucion model
ALTER TABLE "Institucion"
ADD COLUMN "logoUrl" VARCHAR(255);

ALTER TABLE "Institucion"
ADD COLUMN "colorPrimario" VARCHAR(20);

ALTER TABLE "Institucion"
ADD COLUMN "colorSecundario" VARCHAR(20);

ALTER TABLE "Institucion"
ADD COLUMN "mensajeBienvenida" TEXT;

ALTER TABLE "Institucion"
ADD COLUMN "imagenPortada" VARCHAR(255);
