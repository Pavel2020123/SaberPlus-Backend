ALTER TABLE "Cupon"
ADD COLUMN IF NOT EXISTS "titulo" VARCHAR(120),
ADD COLUMN IF NOT EXISTS "esAutomatica" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Cupon_promocion_activa_idx"
ON "Cupon" ("esAutomatica", "activo", "fechaExpiracion");
