-- Point 25: referral links, conversion rewards and checkout credit.
CREATE TYPE "EstadoReferido" AS ENUM ('REGISTRADO', 'RECOMPENSADO');

ALTER TABLE "Usuario"
ADD COLUMN "codigoReferido" VARCHAR(12),
ADD COLUMN "saldoReferidosCop" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "PagoOrden"
ADD COLUMN "creditoReferidosUsado" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Referido" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "referidorId" UUID NOT NULL,
    "referidoId" UUID NOT NULL,
    "codigoUsado" VARCHAR(12) NOT NULL,
    "estado" "EstadoReferido" NOT NULL DEFAULT 'REGISTRADO',
    "recompensaCop" INTEGER NOT NULL DEFAULT 0,
    "ordenPagoId" UUID,
    "fechaRegistro" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaRecompensa" TIMESTAMP(6),

    CONSTRAINT "Referido_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Usuario_codigoReferido_key" ON "Usuario"("codigoReferido");
CREATE UNIQUE INDEX "Referido_referidoId_key" ON "Referido"("referidoId");
CREATE UNIQUE INDEX "Referido_ordenPagoId_key" ON "Referido"("ordenPagoId");
CREATE INDEX "Referido_referidorId_estado_idx" ON "Referido"("referidorId", "estado");

ALTER TABLE "Referido"
ADD CONSTRAINT "Referido_referidorId_fkey"
FOREIGN KEY ("referidorId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Referido"
ADD CONSTRAINT "Referido_referidoId_fkey"
FOREIGN KEY ("referidoId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Referido"
ADD CONSTRAINT "Referido_ordenPagoId_fkey"
FOREIGN KEY ("ordenPagoId") REFERENCES "PagoOrden"("id") ON DELETE SET NULL ON UPDATE CASCADE;
