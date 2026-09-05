DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrigenRespuesta') THEN
    CREATE TYPE "OrigenRespuesta" AS ENUM ('SIMULACRO', 'PERSONALIZADO', 'PRACTICA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "HistorialRespuesta" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "sesionId" UUID NOT NULL,
  "usuarioId" UUID NOT NULL,
  "preguntaId" TEXT NOT NULL,
  "respuestaSeleccionadaId" TEXT NOT NULL,
  "respuestaCorrectaId" TEXT NOT NULL,
  "area" "AreaIcfes" NOT NULL,
  "origen" "OrigenRespuesta" NOT NULL,
  "esCorrecta" BOOLEAN NOT NULL,
  "tiempoRespuestaSegundos" INTEGER,
  "fechaRespuesta" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HistorialRespuesta_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HistorialRespuesta_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HistorialRespuesta_preguntaId_fkey"
    FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "HistorialRespuesta_usuarioId_fechaRespuesta_idx"
ON "HistorialRespuesta"("usuarioId", "fechaRespuesta");

CREATE INDEX IF NOT EXISTS "HistorialRespuesta_usuarioId_esCorrecta_fechaRespuesta_idx"
ON "HistorialRespuesta"("usuarioId", "esCorrecta", "fechaRespuesta");

CREATE INDEX IF NOT EXISTS "HistorialRespuesta_usuarioId_area_fechaRespuesta_idx"
ON "HistorialRespuesta"("usuarioId", "area", "fechaRespuesta");

CREATE INDEX IF NOT EXISTS "HistorialRespuesta_preguntaId_idx"
ON "HistorialRespuesta"("preguntaId");

CREATE INDEX IF NOT EXISTS "HistorialRespuesta_sesionId_idx"
ON "HistorialRespuesta"("sesionId");
