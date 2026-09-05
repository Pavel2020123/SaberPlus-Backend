ALTER TABLE "Anuncio"
ADD COLUMN "institucionId" UUID,
ADD COLUMN "creadoPorId" UUID;

ALTER TABLE "Anuncio"
ADD CONSTRAINT "Anuncio_institucionId_fkey"
FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Anuncio"
ADD CONSTRAINT "Anuncio_creadoPorId_fkey"
FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Anuncio_institucionId_activo_fechaInicio_idx"
ON "Anuncio"("institucionId", "activo", "fechaInicio");

CREATE INDEX "Anuncio_creadoPorId_idx" ON "Anuncio"("creadoPorId");
