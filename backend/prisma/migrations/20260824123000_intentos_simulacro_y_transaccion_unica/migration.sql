CREATE TABLE "IntentoSimulacro" (
    "id" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "origen" "OrigenRespuesta" NOT NULL,
    "area" "AreaIcfes",
    "preguntaIds" JSONB NOT NULL,
    "expira" TIMESTAMP(6) NOT NULL,
    "consumidoEn" TIMESTAMP(6),
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoSimulacro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntentoSimulacro_usuarioId_consumidoEn_expira_idx"
ON "IntentoSimulacro"("usuarioId", "consumidoEn", "expira");

CREATE UNIQUE INDEX "PagoOrden_transaccionId_key"
ON "PagoOrden"("transaccionId");

ALTER TABLE "IntentoSimulacro"
ADD CONSTRAINT "IntentoSimulacro_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
