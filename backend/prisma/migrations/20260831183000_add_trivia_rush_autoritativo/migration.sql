-- AlterEnum
ALTER TYPE "OrigenRespuesta" ADD VALUE 'TRIVIA_RUSH';

-- CreateEnum
CREATE TYPE "EstadoIntentoTriviaRush" AS ENUM ('ACTIVO', 'FINALIZADO', 'EXPIRADO', 'ABANDONADO');

-- CreateEnum
CREATE TYPE "TipoPotenciadorTriviaRush" AS ENUM ('TIEMPO_EXTRA', 'CINCUENTA_CINCUENTA', 'ESCUDO_COMBO', 'SALTAR', 'SEGUNDA_OPORTUNIDAD');

-- CreateEnum
CREATE TYPE "EstadoConcesionRecompensa" AS ENUM ('DISPONIBLE', 'CONSUMIDA', 'EXPIRADA');

-- CreateTable
CREATE TABLE "IntentoTriviaRush" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "usuarioId" UUID NOT NULL,
    "estado" "EstadoIntentoTriviaRush" NOT NULL DEFAULT 'ACTIVO',
    "areas" "AreaIcfes"[],
    "duracionBaseSegundos" INTEGER NOT NULL,
    "tiempoExtraSegundos" INTEGER NOT NULL DEFAULT 0,
    "versionReglas" INTEGER NOT NULL DEFAULT 1,
    "puntaje" INTEGER NOT NULL DEFAULT 0,
    "comboActual" INTEGER NOT NULL DEFAULT 0,
    "mejorCombo" INTEGER NOT NULL DEFAULT 0,
    "respuestasCorrectas" INTEGER NOT NULL DEFAULT 0,
    "respuestasIncorrectas" INTEGER NOT NULL DEFAULT 0,
    "preguntasSaltadas" INTEGER NOT NULL DEFAULT 0,
    "indiceActual" INTEGER NOT NULL DEFAULT 0,
    "asistido" BOOLEAN NOT NULL DEFAULT false,
    "escudoComboActivo" BOOLEAN NOT NULL DEFAULT false,
    "segundaOportunidadActiva" BOOLEAN NOT NULL DEFAULT false,
    "preguntaActualId" TEXT,
    "preguntaIniciaEn" TIMESTAMP(6),
    "iniciadoEn" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" TIMESTAMP(6) NOT NULL,
    "finalizadoEn" TIMESTAMP(6),

    CONSTRAINT "IntentoTriviaRush_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaRushPregunta" (
    "intentoId" UUID NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "opcionesOrden" JSONB NOT NULL,

    CONSTRAINT "TriviaRushPregunta_pkey" PRIMARY KEY ("intentoId", "preguntaId")
);

-- CreateTable
CREATE TABLE "TriviaRushRespuesta" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "intentoId" UUID NOT NULL,
    "preguntaId" TEXT NOT NULL,
    "respuestaSeleccionadaId" TEXT,
    "numeroIntento" INTEGER NOT NULL,
    "esCorrecta" BOOLEAN NOT NULL,
    "esFinal" BOOLEAN NOT NULL,
    "puntosOtorgados" INTEGER NOT NULL DEFAULT 0,
    "comboResultante" INTEGER NOT NULL,
    "tiempoRespuestaMs" INTEGER NOT NULL,
    "claveIdempotencia" UUID NOT NULL,
    "respondidaEn" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaRushRespuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConcesionRecompensaJuego" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "usuarioId" UUID NOT NULL,
    "proveedor" VARCHAR(30) NOT NULL,
    "referenciaProveedor" VARCHAR(180) NOT NULL,
    "estado" "EstadoConcesionRecompensa" NOT NULL DEFAULT 'DISPONIBLE',
    "expiraEn" TIMESTAMP(6) NOT NULL,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumidaEn" TIMESTAMP(6),

    CONSTRAINT "ConcesionRecompensaJuego_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriviaRushPotenciador" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "intentoId" UUID NOT NULL,
    "preguntaId" TEXT,
    "tipo" "TipoPotenciadorTriviaRush" NOT NULL,
    "concesionId" UUID NOT NULL,
    "claveIdempotencia" UUID NOT NULL,
    "opcionesEliminadas" JSONB,
    "activadoEn" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriviaRushPotenciador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntentoTriviaRush_usuarioId_estado_iniciadoEn_idx" ON "IntentoTriviaRush"("usuarioId", "estado", "iniciadoEn");
CREATE INDEX "IntentoTriviaRush_estado_venceEn_idx" ON "IntentoTriviaRush"("estado", "venceEn");
CREATE INDEX "IntentoTriviaRush_preguntaActualId_idx" ON "IntentoTriviaRush"("preguntaActualId");
CREATE UNIQUE INDEX "TriviaRushPregunta_intentoId_orden_key" ON "TriviaRushPregunta"("intentoId", "orden");
CREATE INDEX "TriviaRushPregunta_preguntaId_idx" ON "TriviaRushPregunta"("preguntaId");
CREATE UNIQUE INDEX "TriviaRushRespuesta_claveIdempotencia_key" ON "TriviaRushRespuesta"("claveIdempotencia");
CREATE UNIQUE INDEX "TriviaRushRespuesta_intentoId_preguntaId_numeroIntento_key" ON "TriviaRushRespuesta"("intentoId", "preguntaId", "numeroIntento");
CREATE INDEX "TriviaRushRespuesta_intentoId_esFinal_respondidaEn_idx" ON "TriviaRushRespuesta"("intentoId", "esFinal", "respondidaEn");
CREATE INDEX "TriviaRushRespuesta_preguntaId_idx" ON "TriviaRushRespuesta"("preguntaId");
CREATE UNIQUE INDEX "ConcesionRecompensaJuego_referenciaProveedor_key" ON "ConcesionRecompensaJuego"("referenciaProveedor");
CREATE INDEX "ConcesionRecompensaJuego_usuarioId_estado_expiraEn_idx" ON "ConcesionRecompensaJuego"("usuarioId", "estado", "expiraEn");
CREATE UNIQUE INDEX "TriviaRushPotenciador_concesionId_key" ON "TriviaRushPotenciador"("concesionId");
CREATE UNIQUE INDEX "TriviaRushPotenciador_claveIdempotencia_key" ON "TriviaRushPotenciador"("claveIdempotencia");
CREATE INDEX "TriviaRushPotenciador_intentoId_preguntaId_tipo_idx" ON "TriviaRushPotenciador"("intentoId", "preguntaId", "tipo");

-- AddForeignKey
ALTER TABLE "IntentoTriviaRush" ADD CONSTRAINT "IntentoTriviaRush_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntentoTriviaRush" ADD CONSTRAINT "IntentoTriviaRush_preguntaActualId_fkey" FOREIGN KEY ("preguntaActualId") REFERENCES "Pregunta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TriviaRushPregunta" ADD CONSTRAINT "TriviaRushPregunta_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "IntentoTriviaRush"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriviaRushPregunta" ADD CONSTRAINT "TriviaRushPregunta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TriviaRushRespuesta" ADD CONSTRAINT "TriviaRushRespuesta_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "IntentoTriviaRush"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriviaRushRespuesta" ADD CONSTRAINT "TriviaRushRespuesta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TriviaRushRespuesta" ADD CONSTRAINT "TriviaRushRespuesta_respuestaSeleccionadaId_fkey" FOREIGN KEY ("respuestaSeleccionadaId") REFERENCES "Respuesta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConcesionRecompensaJuego" ADD CONSTRAINT "ConcesionRecompensaJuego_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriviaRushPotenciador" ADD CONSTRAINT "TriviaRushPotenciador_intentoId_fkey" FOREIGN KEY ("intentoId") REFERENCES "IntentoTriviaRush"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriviaRushPotenciador" ADD CONSTRAINT "TriviaRushPotenciador_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TriviaRushPotenciador" ADD CONSTRAINT "TriviaRushPotenciador_concesionId_fkey" FOREIGN KEY ("concesionId") REFERENCES "ConcesionRecompensaJuego"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
