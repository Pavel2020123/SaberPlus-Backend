/*
  Warnings:

  - A unique constraint covering the columns `[tokenRecuperacion]` on the table `Usuario` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "tokenRecuperacion" VARCHAR(255),
ADD COLUMN     "tokenRecuperacionExpira" TIMESTAMP(6);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_tokenRecuperacion_key" ON "Usuario"("tokenRecuperacion");
