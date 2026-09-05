/*
  Warnings:

  - A unique constraint covering the columns `[tokenVerificacion]` on the table `Usuario` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "correoVerificado" BOOLEAN DEFAULT false,
ADD COLUMN     "tokenVerificacion" VARCHAR(255),
ADD COLUMN     "tokenVerificacionExpira" TIMESTAMP(6);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_tokenVerificacion_key" ON "Usuario"("tokenVerificacion");
