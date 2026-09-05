-- CreateEnum
CREATE TYPE "TipoPlan" AS ENUM ('MENSUAL', 'TEMPORADA_A', 'TEMPORADA_B');

-- AlterTable
ALTER TABLE "PagoOrden" ADD COLUMN     "tipoPlan" "TipoPlan" NOT NULL DEFAULT 'MENSUAL';
