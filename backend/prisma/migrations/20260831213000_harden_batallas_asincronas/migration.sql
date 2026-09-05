-- CreateEnum
CREATE TYPE "MotivoReporteBatalla" AS ENUM ('CONDUCTA_INAPROPIADA', 'NOMBRE_INAPROPIADO', 'TRAMPA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoReporteBatalla" AS ENUM ('RECIBIDO', 'EN_REVISION', 'RESUELTO', 'DESCARTADO');

-- AlterTable
ALTER TABLE "Batalla" ADD COLUMN "codigoInvitacion" VARCHAR(8);

-- CreateTable
CREATE TABLE "BatallaBloqueo" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bloqueadorId" UUID NOT NULL,
    "bloqueadoId" UUID NOT NULL,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatallaBloqueo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatallaReporte" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "batallaId" UUID NOT NULL,
    "reportanteId" UUID NOT NULL,
    "reportadoId" UUID NOT NULL,
    "motivo" "MotivoReporteBatalla" NOT NULL,
    "detalle" VARCHAR(500),
    "estado" "EstadoReporteBatalla" NOT NULL DEFAULT 'RECIBIDO',
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatallaReporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Batalla_codigoInvitacion_key" ON "Batalla"("codigoInvitacion");
CREATE UNIQUE INDEX "BatallaBloqueo_bloqueadorId_bloqueadoId_key" ON "BatallaBloqueo"("bloqueadorId", "bloqueadoId");
CREATE INDEX "BatallaBloqueo_bloqueadoId_fechaCreacion_idx" ON "BatallaBloqueo"("bloqueadoId", "fechaCreacion");
CREATE UNIQUE INDEX "BatallaReporte_batallaId_reportanteId_key" ON "BatallaReporte"("batallaId", "reportanteId");
CREATE INDEX "BatallaReporte_reportadoId_estado_fechaCreacion_idx" ON "BatallaReporte"("reportadoId", "estado", "fechaCreacion");

-- AddForeignKey
ALTER TABLE "BatallaBloqueo" ADD CONSTRAINT "BatallaBloqueo_bloqueadorId_fkey" FOREIGN KEY ("bloqueadorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaBloqueo" ADD CONSTRAINT "BatallaBloqueo_bloqueadoId_fkey" FOREIGN KEY ("bloqueadoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaReporte" ADD CONSTRAINT "BatallaReporte_batallaId_fkey" FOREIGN KEY ("batallaId") REFERENCES "Batalla"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaReporte" ADD CONSTRAINT "BatallaReporte_reportanteId_fkey" FOREIGN KEY ("reportanteId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatallaReporte" ADD CONSTRAINT "BatallaReporte_reportadoId_fkey" FOREIGN KEY ("reportadoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
