-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog" VERSION "1.0";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public" VERSION "1.1";

-- CreateEnum
CREATE TYPE "AreaIcfes" AS ENUM ('LECTURA_CRITICA', 'MATEMATICAS', 'SOCIALES_CIUDADANAS', 'CIENCIAS_NATURALES', 'INGLES');

-- CreateEnum
CREATE TYPE "Dificultad" AS ENUM ('BASICO', 'MEDIO', 'AVANZADO');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ESTUDIANTE', 'PROFESOR', 'ADMIN');

-- CreateTable
CREATE TABLE "Clase" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "nombre" VARCHAR(255) NOT NULL,
    "codigoIngreso" VARCHAR(50) NOT NULL,
    "institucionId" UUID NOT NULL,

    CONSTRAINT "Clase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaseEstudiante" (
    "usuarioId" UUID NOT NULL,
    "claseId" UUID NOT NULL,

    CONSTRAINT "ClaseEstudiante_pkey" PRIMARY KEY ("usuarioId","claseId")
);

-- CreateTable
CREATE TABLE "Institucion" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "nombre" VARCHAR(255) NOT NULL,
    "codigoUnico" VARCHAR(50) NOT NULL,
    "planActual" VARCHAR(50) DEFAULT 'GRATIS',

    CONSTRAINT "Institucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pregunta" (
    "id" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "imagenUrl" TEXT,
    "dificultad" "Dificultad" NOT NULL DEFAULT 'MEDIO',
    "porcentajeAciertos" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "tiempoPromedioSegundos" INTEGER NOT NULL DEFAULT 0,
    "subtemaId" TEXT NOT NULL,

    CONSTRAINT "Pregunta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgresoTema" (
    "id" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "subtemaId" TEXT NOT NULL,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "porcentaje" INTEGER NOT NULL DEFAULT 0,
    "fechaVisto" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgresoTema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Respuesta" (
    "id" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "esCorrecta" BOOLEAN NOT NULL DEFAULT false,
    "preguntaId" TEXT NOT NULL,

    CONSTRAINT "Respuesta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultadoSimulacro" (
    "id" TEXT NOT NULL,
    "usuarioId" UUID NOT NULL,
    "area" "AreaIcfes" NOT NULL,
    "totalPreguntas" INTEGER NOT NULL,
    "respuestasCorrectas" INTEGER NOT NULL,
    "puntaje" DOUBLE PRECISION NOT NULL,
    "xpGanado" INTEGER NOT NULL DEFAULT 0,
    "fechaRealizado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultadoSimulacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subtema" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "temaId" TEXT NOT NULL,
    "contenido" TEXT,
    "imagenUrl" TEXT,
    "videoUrl" TEXT,

    CONSTRAINT "Subtema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tema" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "area" "AreaIcfes" NOT NULL,

    CONSTRAINT "Tema_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "nombre" VARCHAR(255) NOT NULL,
    "correo" VARCHAR(255) NOT NULL,
    "contrasenaHash" TEXT NOT NULL,
    "rol" "RolUsuario" DEFAULT 'ESTUDIANTE',
    "xpTotal" INTEGER DEFAULT 0,
    "fechaCreacion" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "institucionId" UUID,
    "descripcion" TEXT,
    "fotoPerfil" TEXT,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Clase_codigoIngreso_key" ON "Clase"("codigoIngreso" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Institucion_codigoUnico_key" ON "Institucion"("codigoUnico" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProgresoTema_usuarioId_subtemaId_key" ON "ProgresoTema"("usuarioId" ASC, "subtemaId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "Usuario"("correo" ASC);

-- AddForeignKey
ALTER TABLE "Clase" ADD CONSTRAINT "fk_clase_institucion" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClaseEstudiante" ADD CONSTRAINT "fk_ce_clase" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ClaseEstudiante" ADD CONSTRAINT "fk_ce_usuario" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "Pregunta" ADD CONSTRAINT "Pregunta_subtemaId_fkey" FOREIGN KEY ("subtemaId") REFERENCES "Subtema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgresoTema" ADD CONSTRAINT "ProgresoTema_subtemaId_fkey" FOREIGN KEY ("subtemaId") REFERENCES "Subtema"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgresoTema" ADD CONSTRAINT "ProgresoTema_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Respuesta" ADD CONSTRAINT "Respuesta_preguntaId_fkey" FOREIGN KEY ("preguntaId") REFERENCES "Pregunta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultadoSimulacro" ADD CONSTRAINT "ResultadoSimulacro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtema" ADD CONSTRAINT "Subtema_temaId_fkey" FOREIGN KEY ("temaId") REFERENCES "Tema"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "fk_institucion" FOREIGN KEY ("institucionId") REFERENCES "Institucion"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

