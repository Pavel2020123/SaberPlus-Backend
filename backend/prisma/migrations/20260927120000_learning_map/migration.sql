-- Orientación académica, sin progreso, notas, permisos de lección ni XP.
CREATE TABLE "MapaAprendizaje" (
  "area" "AreaIcfes" NOT NULL PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoPor" TEXT
);
CREATE TABLE "RelacionAprendizaje" (
  "area" "AreaIcfes" NOT NULL,
  "previoId" TEXT NOT NULL,
  "destinoId" TEXT NOT NULL,
  CONSTRAINT "RelacionAprendizaje_pkey" PRIMARY KEY ("previoId", "destinoId"),
  CONSTRAINT "RelacionAprendizaje_no_self" CHECK ("previoId" <> "destinoId"),
  CONSTRAINT "RelacionAprendizaje_area_fkey" FOREIGN KEY ("area") REFERENCES "MapaAprendizaje"("area") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RelacionAprendizaje_previoId_fkey" FOREIGN KEY ("previoId") REFERENCES "Subtema"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RelacionAprendizaje_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Subtema"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RelacionAprendizaje_area_destinoId_idx" ON "RelacionAprendizaje"("area", "destinoId");
CREATE INDEX "RelacionAprendizaje_destinoId_idx" ON "RelacionAprendizaje"("destinoId");
-- El API aplica misma área, límite y aciclicidad bajo bloqueo transaccional.
-- Las referencias se limpian al eliminar un subtema permitido; no eliminan contenido.
ALTER TABLE "MapaAprendizaje" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RelacionAprendizaje" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MapaAprendizaje", "RelacionAprendizaje" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "MapaAprendizaje", "RelacionAprendizaje" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "MapaAprendizaje", "RelacionAprendizaje" FROM authenticated;
  END IF;
END $$;
