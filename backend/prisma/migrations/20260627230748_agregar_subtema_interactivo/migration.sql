-- CreateEnum
CREATE TYPE "TipoInteractivo" AS ENUM ('CLOZE');

-- AlterTable
ALTER TABLE "Subtema" ADD COLUMN     "datosInteractivo" JSONB,
ADD COLUMN     "tipoInteractivo" "TipoInteractivo";
