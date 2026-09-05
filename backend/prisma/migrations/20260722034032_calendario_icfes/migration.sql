-- CreateEnum
CREATE TYPE "CalendarioTipo" AS ENUM ('A', 'B');

-- AlterTable
ALTER TABLE "Institucion" ADD COLUMN     "calendarioIcfes" "CalendarioTipo" DEFAULT 'A',
ADD COLUMN     "fechaVencimientoPlan" TIMESTAMP(6);

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "calendarioIcfes" "CalendarioTipo" DEFAULT 'A';

-- CreateTable
CREATE TABLE "CalendarioIcfes" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "anio" INTEGER NOT NULL,
    "calendario" "CalendarioTipo" NOT NULL,
    "fechaExamen" DATE NOT NULL,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarioIcfes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarioIcfes_anio_calendario_key" ON "CalendarioIcfes"("anio", "calendario");
