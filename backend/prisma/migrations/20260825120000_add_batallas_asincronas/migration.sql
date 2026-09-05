-- CreateEnum
CREATE TYPE "ModoBatalla" AS ENUM ('CARRERA_FANTASMA', 'DUELO_RELAMPAGO', 'SUPERVIVENCIA');

-- CreateEnum
CREATE TYPE "EstadoBatalla" AS ENUM ('BUSCANDO', 'PENDIENTE', 'ACTIVA', 'FINALIZADA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoParticipanteBatalla" AS ENUM ('INVITADO', 'LISTO', 'EN_JUEGO', 'FINALIZADO');

-- CreateEnum
CREATE TYPE "ResultadoParticipanteBatalla" AS ENUM ('PENDIENTE', 'GANADA', 'PERDIDA', 'EMPATE');

-- AlterEnum
ALTER TYPE "OrigenRespuesta" ADD VALUE 'BATALLA';

-- CreateTable
CREATE TABLE "Batalla" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "modo" "ModoBatalla" NOT NULL,
    "estado" "EstadoBatalla" NOT NULL DEFAULT 'BUSCANDO',
    "area" "AreaIcfes",
    "retadorId" UUID NOT NULL,
    "rivalId" UUID,
    "ganadorId" UUID,
    "xpLiquidadoEn" TIMESTAMP(6),
    "expiraEn" TIMESTAMP(6) NOT NULL,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActivacion" TIMESTAMP(6),
    "fechaFinalizacion" TIMESTAMP(6),

    CONSTRAINT "Batalla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatallaPregunta" (
    "batallaId" UUID NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "opcionesOrden" JSONB NOT NULL,

    CONSTRAINT "BatallaPregunta_pkey" PRIMARY KEY ("batallaId", "preguntaId")
);

-- CreateTable
CREATE TABLE "BatallaParticipante" (
    "batallaId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "estado" "EstadoParticipanteBatalla" NOT NULL DEFAULT 'LISTO',
    "resultado" "ResultadoParticipanteBatalla" NOT NULL DEFAULT 'PENDIENTE',
    "iniciadoEn" TIMESTAMP(6),
    "finalizadoEn" TIMESTAMP(6),
    "respuestasCorrectas" INTEGER NOT NULL DEFAULT 0,
    "tiempoTotalSegundos" INTEGER NOT NULL DEFAULT 0,
    "vidasRestantes" INTEGER,
    "xpElegible" BOOLEAN NOT NULL DEFAULT true,
    "xpGanado" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BatallaParticipante_pkey" PRIMARY KEY ("batallaId", "usuarioId")
);

-- CreateTable
CREATE TABLE "BatallaRespuesta" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "batallaId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "respuestaSeleccionadaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "esCorrecta" BOOLEAN NOT NULL,
    "tiempoRespuestaSegundos" INTEGER NOT NULL,
    "respondidaEn" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatallaRespuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatallaEstadistica" (
    "usuarioId" UUID NOT NULL,
    "batallasJugadas" INTEGER NOT NULL DEFAULT 0,
    "victorias" INTEGER NOT NULL DEFAULT 0,
    "derrotas" INTEGER NOT NULL DEFAULT 0,
    "empates" INTEGER NOT NULL DEFAULT 0,
    "rachaVictoriasActual" INTEGER NOT NULL DEFAULT 0,
    "mejorRachaVictorias" INTEGER NOT NULL DEFAULT 0,
    "victoriasPerfectas" INTEGER NOT NULL DEFAULT 0,
    "xpBatallas" INTEGER NOT NULL DEFAULT 0,
    "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatallaEstadistica_pkey" PRIMARY KEY ("usuarioId")
);

-- CreateIndex
CREATE INDEX "Batalla_estado_modo_area_expiraEn_idx" ON "Batalla"("estado", "modo", "area", "expiraEn");
CREATE INDEX "Batalla_retadorId_fechaCreacion_idx" ON "Batalla"("retadorId", "fechaCreacion");
CREATE INDEX "Batalla_rivalId_fechaCreacion_idx" ON "Batalla"("rivalId", "fechaCreacion");
CREATE INDEX "Batalla_ganadorId_idx" ON "Batalla"("ganadorId");
CREATE UNIQUE INDEX "BatallaPregunta_batallaId_orden_key" ON "BatallaPregunta"("batallaId", "orden");
CREATE INDEX "BatallaPregunta_preguntaId_idx" ON "BatallaPregunta"("preguntaId");
CREATE INDEX "BatallaParticipante_usuarioId_finalizadoEn_idx" ON "BatallaParticipante"("usuarioId", "finalizadoEn");
CREATE INDEX "BatallaParticipante_usuarioId_resultado_finalizadoEn_idx" ON "BatallaParticipante"("usuarioId", "resultado", "finalizadoEn");
CREATE UNIQUE INDEX "BatallaRespuesta_batallaId_usuarioId_preguntaId_key" ON "BatallaRespuesta"("batallaId", "usuarioId", "preguntaId");
CREATE UNIQUE INDEX "BatallaRespuesta_batallaId_usuarioId_orden_key" ON "BatallaRespuesta"("batallaId", "usuarioId", "orden");
CREATE INDEX "BatallaRespuesta_batallaId_usuarioId_respondidaEn_idx" ON "BatallaRespuesta"("batallaId", "usuarioId", "respondidaEn");
CREATE INDEX "BatallaRespuesta_preguntaId_idx" ON "BatallaRespuesta"("preguntaId");

-- AddForeignKey
ALTER TABLE "Batalla" ADD CONSTRAINT "Batalla_retadorId_fkey" FOREIGN KEY ("retadorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Batalla" ADD CONSTRAINT "Batalla_rivalId_fkey" FOREIGN KEY ("rivalId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Batalla" ADD CONSTRAINT "Batalla_ganadorId_fkey" FOREIGN KEY ("ganadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BatallaPregunta" ADD CONSTRAINT "BatallaPregunta_batallaId_fkey" FOREIGN KEY ("batallaId") REFERENCES "Batalla"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaPregunta" ADD CONSTRAINT "BatallaPregunta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatallaParticipante" ADD CONSTRAINT "BatallaParticipante_batallaId_fkey" FOREIGN KEY ("batallaId") REFERENCES "Batalla"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaParticipante" ADD CONSTRAINT "BatallaParticipante_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaRespuesta" ADD CONSTRAINT "BatallaRespuesta_batallaId_fkey" FOREIGN KEY ("batallaId") REFERENCES "Batalla"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaRespuesta" ADD CONSTRAINT "BatallaRespuesta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaRespuesta" ADD CONSTRAINT "BatallaRespuesta_batallaId_usuarioId_fkey" FOREIGN KEY ("batallaId", "usuarioId") REFERENCES "BatallaParticipante"("batallaId", "usuarioId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaRespuesta" ADD CONSTRAINT "BatallaRespuesta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatallaRespuesta" ADD CONSTRAINT "BatallaRespuesta_respuestaSeleccionadaId_fkey" FOREIGN KEY ("respuestaSeleccionadaId") REFERENCES "Respuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatallaEstadistica" ADD CONSTRAINT "BatallaEstadistica_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
