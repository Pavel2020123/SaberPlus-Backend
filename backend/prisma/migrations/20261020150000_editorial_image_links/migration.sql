-- C5-B: referencias estables a imágenes, incluidas versiones académicas anteriores.
ALTER TABLE "Pregunta" ADD COLUMN "archivoImagenId" UUID;
ALTER TABLE "CasoPregunta" ADD COLUMN "archivoImagenId" UUID;
ALTER TABLE "Subtema" ADD COLUMN "archivoImagenId" UUID;
ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_archivoImagenId_fkey" FOREIGN KEY ("archivoImagenId") REFERENCES "ArchivoEditorial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CasoPregunta" ADD CONSTRAINT "CasoPregunta_archivoImagenId_fkey" FOREIGN KEY ("archivoImagenId") REFERENCES "ArchivoEditorial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subtema" ADD CONSTRAINT "Subtema_archivoImagenId_fkey" FOREIGN KEY ("archivoImagenId") REFERENCES "ArchivoEditorial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Pregunta_archivoImagenId_idx" ON "Pregunta"("archivoImagenId");
CREATE INDEX "CasoPregunta_archivoImagenId_idx" ON "CasoPregunta"("archivoImagenId");
CREATE INDEX "Subtema_archivoImagenId_idx" ON "Subtema"("archivoImagenId");
