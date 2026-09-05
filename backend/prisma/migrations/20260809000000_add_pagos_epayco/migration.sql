-- Punto 9 del roadmap: pasarela de pago (ePayco) para el estudiante
-- individual. Sin esto, el muro de pago de 3 días (punto 5) solo
-- bloquea, pero nadie puede pagar para reactivar su acceso.

-- Grado del estudiante individual: define el precio ($25.000 g10 /
-- $35.000 g11, según la tabla "Individual (Referencia)" del roadmap).
ALTER TABLE "Usuario" ADD COLUMN "grado" "Grado";

-- Estado de una orden/intento de pago con ePayco.
CREATE TYPE "EstadoPago" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'PENDIENTE_BANCO', 'FALLIDA');

CREATE TABLE "PagoOrden" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "factura" VARCHAR(50) NOT NULL,
    "usuarioId" UUID NOT NULL,
    "grado" "Grado" NOT NULL,
    "monto" INTEGER NOT NULL,
    "moneda" VARCHAR(10) NOT NULL DEFAULT 'COP',
    "estado" "EstadoPago" NOT NULL DEFAULT 'PENDIENTE',
    "refPayco" VARCHAR(50),
    "transaccionId" VARCHAR(100),
    "motivoRespuesta" TEXT,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaActualizacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoOrden_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PagoOrden_factura_key" ON "PagoOrden"("factura");

CREATE INDEX "PagoOrden_usuarioId_idx" ON "PagoOrden"("usuarioId");

ALTER TABLE "PagoOrden" ADD CONSTRAINT "fk_pagoorden_usuario" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE NO ACTION;