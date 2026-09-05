-- CreateEnum
CREATE TYPE "LineaInteres" AS ENUM ('ONCE', 'BACHILLERATO');

-- CreateTable
CREATE TABLE "LeadVentas" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "nombreColegio" VARCHAR(255) NOT NULL,
    "nombreContacto" VARCHAR(255) NOT NULL,
    "correo" VARCHAR(255) NOT NULL,
    "telefono" VARCHAR(50),
    "ciudad" VARCHAR(100),
    "linea" "LineaInteres" NOT NULL,
    "plan" VARCHAR(50) NOT NULL,
    "numeroEstudiantesAprox" INTEGER,
    "mensaje" TEXT,
    "atendido" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadVentas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadVentas_atendido_fechaCreacion_idx"
ON "LeadVentas"("atendido", "fechaCreacion");
