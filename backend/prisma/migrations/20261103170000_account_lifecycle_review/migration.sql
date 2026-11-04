-- LIC-4 additive local design. Run only against explicitly owned disposable DBs.
ALTER TABLE "Usuario" ADD COLUMN "suprimidaEn" TIMESTAMPTZ(3);
ALTER TABLE "Usuario" DROP CONSTRAINT "Usuario_identidad_presente";
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_identidad_presente" CHECK (
  ("suprimidaEn" IS NULL AND ("correo" IS NOT NULL OR "identificadorInstitucional" IS NOT NULL))
  OR ("suprimidaEn" IS NOT NULL AND "correo" IS NULL AND "identificadorInstitucional" IS NULL
      AND "rol" IS NULL AND "institucionId" IS NULL AND "nombre" = 'Cuenta eliminada')
);

CREATE TABLE "SolicitudSupresionCuenta" (
  "id" UUID PRIMARY KEY,
  "operacionId" UUID NOT NULL UNIQUE,
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
  "solicitanteId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE RESTRICT,
  "revisorId" UUID REFERENCES "Usuario"("id") ON DELETE RESTRICT,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  "motivo" VARCHAR(500) NOT NULL,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "revisadoEn" TIMESTAMPTZ(3),
  "ejecutadoEn" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "Supresion_estado_check" CHECK (
    ("estado" = 'PENDIENTE' AND "revisorId" IS NULL AND "revisadoEn" IS NULL AND "ejecutadoEn" IS NULL)
    OR ("estado" = 'RECHAZADA' AND "revisorId" IS NOT NULL AND "revisadoEn" IS NOT NULL AND "ejecutadoEn" IS NULL)
    OR ("estado" = 'EJECUTADA' AND "revisorId" IS NOT NULL AND "revisadoEn" IS NOT NULL AND "ejecutadoEn" IS NOT NULL)
  ),
  CONSTRAINT "Supresion_version_check" CHECK ("version" > 0),
  CONSTRAINT "Supresion_motivo_check" CHECK (length(btrim("motivo")) > 0)
);
CREATE INDEX "SolicitudSupresionCuenta_estado_creadoEn_idx" ON "SolicitudSupresionCuenta"("estado", "creadoEn");
CREATE INDEX "SolicitudSupresionCuenta_usuarioId_creadoEn_idx" ON "SolicitudSupresionCuenta"("usuarioId", "creadoEn");
CREATE UNIQUE INDEX "Supresion_una_pendiente_por_cuenta" ON "SolicitudSupresionCuenta"("usuarioId") WHERE "estado" = 'PENDIENTE';
ALTER TABLE "SolicitudSupresionCuenta" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SolicitudSupresionCuenta" FROM PUBLIC, anon, authenticated;

-- A suppressed identity is a permanent anonymous reference for shared receipts.
-- It cannot be restored by a generic profile/admin update or password reset.
CREATE FUNCTION sp_lic4_no_reactivar_usuario() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."suprimidaEn" IS NOT NULL THEN
    RAISE EXCEPTION 'Cuenta suprimida: no se permite reactivacion' USING ERRCODE = '23514';
  END IF;
  IF NEW."suprimidaEn" IS NOT NULL AND
    (NEW."rol" IS NOT NULL OR NEW."correo" IS NOT NULL OR NEW."identificadorInstitucional" IS NOT NULL OR NEW."institucionId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Supresion requiere retirar identidad y vinculo' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sp_lic4_usuario_permanente BEFORE UPDATE ON "Usuario"
  FOR EACH ROW EXECUTE FUNCTION sp_lic4_no_reactivar_usuario();
