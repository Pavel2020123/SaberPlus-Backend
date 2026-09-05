-- CreateEnum
CREATE TYPE "EstadoPartidaTiraAfloja" AS ENUM ('BUSCANDO', 'PREPARANDO', 'ACTIVA', 'FINALIZADA', 'CANCELADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "ResultadoPartidaTiraAfloja" AS ENUM ('JUGADOR_A', 'JUGADOR_B', 'EMPATE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoEventoTiraAfloja" AS ENUM ('BUSQUEDA_INICIADA', 'EMPAREJADA', 'RONDA_INICIADA', 'RONDA_RESUELTA', 'FINALIZADA', 'ABANDONO', 'CANCELADA');

-- CreateTable
CREATE TABLE "PartidaTiraAfloja" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "estado" "EstadoPartidaTiraAfloja" NOT NULL DEFAULT 'BUSCANDO',
    "resultado" "ResultadoPartidaTiraAfloja",
    "area" "AreaIcfes",
    "jugadorAId" UUID NOT NULL,
    "jugadorBId" UUID,
    "ganadorId" UUID,
    "posicionCuerda" INTEGER NOT NULL DEFAULT 0,
    "rondaActual" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "versionReglas" INTEGER NOT NULL DEFAULT 1,
    "listoA" BOOLEAN NOT NULL DEFAULT false,
    "listoB" BOOLEAN NOT NULL DEFAULT false,
    "preguntaActualId" TEXT,
    "rondaIniciaEn" TIMESTAMP(6),
    "rondaVenceEn" TIMESTAMP(6),
    "expiraEn" TIMESTAMP(6) NOT NULL,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEmparejamiento" TIMESTAMP(6),
    "fechaFinalizacion" TIMESTAMP(6),

    CONSTRAINT "PartidaTiraAfloja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TiraAflojaPregunta" (
    "partidaId" UUID NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "opcionesOrden" JSONB NOT NULL,

    CONSTRAINT "TiraAflojaPregunta_pkey" PRIMARY KEY ("partidaId", "preguntaId")
);

-- CreateTable
CREATE TABLE "TiraAflojaRespuesta" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "partidaId" UUID NOT NULL,
    "ronda" INTEGER NOT NULL,
    "usuarioId" UUID NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "respuestaSeleccionadaId" TEXT NOT NULL,
    "esCorrecta" BOOLEAN NOT NULL,
    "recibidaEn" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claveIdempotencia" UUID NOT NULL,

    CONSTRAINT "TiraAflojaRespuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TiraAflojaEvento" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "partidaId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "tipo" "TipoEventoTiraAfloja" NOT NULL,
    "datos" JSONB NOT NULL,
    "fecha" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TiraAflojaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartidaTiraAfloja_estado_area_expiraEn_idx" ON "PartidaTiraAfloja"("estado", "area", "expiraEn");
CREATE INDEX "PartidaTiraAfloja_jugadorAId_estado_idx" ON "PartidaTiraAfloja"("jugadorAId", "estado");
CREATE INDEX "PartidaTiraAfloja_jugadorBId_estado_idx" ON "PartidaTiraAfloja"("jugadorBId", "estado");
CREATE INDEX "PartidaTiraAfloja_ganadorId_idx" ON "PartidaTiraAfloja"("ganadorId");
CREATE UNIQUE INDEX "TiraAflojaPregunta_partidaId_orden_key" ON "TiraAflojaPregunta"("partidaId", "orden");
CREATE INDEX "TiraAflojaPregunta_preguntaId_idx" ON "TiraAflojaPregunta"("preguntaId");
CREATE UNIQUE INDEX "TiraAflojaRespuesta_claveIdempotencia_key" ON "TiraAflojaRespuesta"("claveIdempotencia");
CREATE UNIQUE INDEX "TiraAflojaRespuesta_partidaId_ronda_usuarioId_key" ON "TiraAflojaRespuesta"("partidaId", "ronda", "usuarioId");
CREATE INDEX "TiraAflojaRespuesta_partidaId_ronda_recibidaEn_idx" ON "TiraAflojaRespuesta"("partidaId", "ronda", "recibidaEn");
CREATE INDEX "TiraAflojaRespuesta_usuarioId_recibidaEn_idx" ON "TiraAflojaRespuesta"("usuarioId", "recibidaEn");
CREATE INDEX "TiraAflojaRespuesta_preguntaId_idx" ON "TiraAflojaRespuesta"("preguntaId");
CREATE UNIQUE INDEX "TiraAflojaEvento_partidaId_version_key" ON "TiraAflojaEvento"("partidaId", "version");
CREATE INDEX "TiraAflojaEvento_partidaId_fecha_idx" ON "TiraAflojaEvento"("partidaId", "fecha");

-- AddForeignKey
ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT "PartidaTiraAfloja_jugadorAId_fkey" FOREIGN KEY ("jugadorAId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT "PartidaTiraAfloja_jugadorBId_fkey" FOREIGN KEY ("jugadorBId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT "PartidaTiraAfloja_ganadorId_fkey" FOREIGN KEY ("ganadorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartidaTiraAfloja" ADD CONSTRAINT "PartidaTiraAfloja_preguntaActualId_fkey" FOREIGN KEY ("preguntaActualId") REFERENCES "Pregunta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TiraAflojaPregunta" ADD CONSTRAINT "TiraAflojaPregunta_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "PartidaTiraAfloja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TiraAflojaPregunta" ADD CONSTRAINT "TiraAflojaPregunta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TiraAflojaRespuesta" ADD CONSTRAINT "TiraAflojaRespuesta_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "PartidaTiraAfloja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TiraAflojaRespuesta" ADD CONSTRAINT "TiraAflojaRespuesta_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TiraAflojaRespuesta" ADD CONSTRAINT "TiraAflojaRespuesta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TiraAflojaRespuesta" ADD CONSTRAINT "TiraAflojaRespuesta_respuestaSeleccionadaId_fkey" FOREIGN KEY ("respuestaSeleccionadaId") REFERENCES "Respuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TiraAflojaEvento" ADD CONSTRAINT "TiraAflojaEvento_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "PartidaTiraAfloja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
