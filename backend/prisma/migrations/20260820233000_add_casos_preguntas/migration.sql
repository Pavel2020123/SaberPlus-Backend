CREATE TABLE IF NOT EXISTS "CasoPregunta" (
  "id" TEXT NOT NULL,
  "titulo" TEXT,
  "contexto" TEXT NOT NULL,
  "imagenUrl" TEXT,
  "area" "AreaIcfes" NOT NULL,
  "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CasoPregunta_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Pregunta"
ADD COLUMN IF NOT EXISTS "casoId" TEXT,
ADD COLUMN IF NOT EXISTS "ordenEnCaso" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Pregunta_casoId_fkey'
  ) THEN
    ALTER TABLE "Pregunta"
    ADD CONSTRAINT "Pregunta_casoId_fkey"
    FOREIGN KEY ("casoId") REFERENCES "CasoPregunta"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pregunta_casoId_ordenEnCaso_idx"
ON "Pregunta"("casoId", "ordenEnCaso");

CREATE INDEX IF NOT EXISTS "CasoPregunta_area_fechaCreacion_idx"
ON "CasoPregunta"("area", "fechaCreacion");
