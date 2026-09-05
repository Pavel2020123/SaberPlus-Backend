-- Punto 13 del roadmap: cupones y promociones creados por el admin.
-- El admin define un % de descuento, a qué tipoPlan aplica (o a todos
-- si queda en null), hasta cuándo es válido y cuántas personas pueden
-- usarlo como máximo (usosMaximos null = sin límite de usos).

-- CreateTable
CREATE TABLE "Cupon" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "codigo" VARCHAR(50) NOT NULL,
    "porcentajeDescuento" INTEGER NOT NULL,
    "tipoPlan" "TipoPlan",
    "fechaExpiracion" TIMESTAMP(6) NOT NULL,
    "usosMaximos" INTEGER,
    "usosActuales" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cupon_codigo_key" ON "Cupon"("codigo");

-- AlterTable: guardamos el precio de lista original y a qué cupón
-- quedó asociada la orden, para poder auditar el descuento aplicado.
ALTER TABLE "PagoOrden" ADD COLUMN     "montoOriginal" INTEGER;
ALTER TABLE "PagoOrden" ADD COLUMN     "cuponId" UUID;

CREATE INDEX "PagoOrden_cuponId_idx" ON "PagoOrden"("cuponId");

ALTER TABLE "PagoOrden" ADD CONSTRAINT "fk_pagoorden_cupon" FOREIGN KEY ("cuponId") REFERENCES "Cupon"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
