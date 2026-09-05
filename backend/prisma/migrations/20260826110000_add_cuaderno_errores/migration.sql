CREATE TYPE "EstadoCuadernoError" AS ENUM ('PENDIENTE', 'REPASANDO', 'DOMINADO');

CREATE TABLE "CuadernoError" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "usuarioId" UUID NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "nota" TEXT,
    "estado" "EstadoCuadernoError" NOT NULL DEFAULT 'PENDIENTE',
    "dominadoEn" TIMESTAMP(6),
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CuadernoError_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CuadernoError_usuarioId_preguntaId_key"
ON "CuadernoError"("usuarioId", "preguntaId");

CREATE INDEX "CuadernoError_usuarioId_estado_fechaActualizacion_idx"
ON "CuadernoError"("usuarioId", "estado", "fechaActualizacion");

ALTER TABLE "CuadernoError"
ADD CONSTRAINT "CuadernoError_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CuadernoError"
ADD CONSTRAINT "CuadernoError_preguntaId_fkey"
FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
