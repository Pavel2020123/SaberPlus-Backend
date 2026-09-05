ALTER TABLE "Pregunta"
ADD COLUMN "huellaContenido" VARCHAR(64);

CREATE INDEX "Pregunta_huellaContenido_estadoContenido_idx"
ON "Pregunta"("huellaContenido", "estadoContenido");
