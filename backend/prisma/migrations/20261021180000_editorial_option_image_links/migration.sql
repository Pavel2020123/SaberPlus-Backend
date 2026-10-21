-- C5-C2-A: base aditiva. La carga desde el editor y los clientes se habilitan después.
-- Mantener texto obligatorio: también será la descripción accesible de la opción.
ALTER TABLE "Respuesta" ADD COLUMN "imagenUrl" TEXT;
ALTER TABLE "Respuesta" ADD COLUMN "archivoImagenId" UUID;
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_archivoImagenId_fkey"
  FOREIGN KEY ("archivoImagenId") REFERENCES "ArchivoEditorial"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Respuesta_archivoImagenId_idx" ON "Respuesta"("archivoImagenId");

-- Una referencia privada solo es válida con su FK y su ruta canónica.
-- Los enlaces externos futuros no pueden disfrazarse de recursos privados.
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_imagen_editorial_check" CHECK (
  ("archivoImagenId" IS NOT NULL AND "imagenUrl" IS NOT NULL
    AND "imagenUrl" = '/recursos/editoriales/' || "archivoImagenId"::text)
  OR
  ("archivoImagenId" IS NULL AND ("imagenUrl" IS NULL
    OR "imagenUrl" ~ '^https://[^[:space:]]+$'))
);
