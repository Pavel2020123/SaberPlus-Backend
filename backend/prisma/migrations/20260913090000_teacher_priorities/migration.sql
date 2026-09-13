CREATE TABLE "PrioridadDocente" (
    "id" UUID NOT NULL,
    "claseId" UUID NOT NULL,
    "creadoPorId" UUID NOT NULL,
    "huellaSolicitud" VARCHAR(64) NOT NULL,
    "area" "AreaIcfes" NOT NULL,
    "temaId" TEXT NOT NULL,
    "temaNombre" TEXT NOT NULL,
    "subtemaId" TEXT,
    "subtemaNombre" TEXT,
    "preguntaIds" TEXT[] NOT NULL,
    "metaPreguntas" INTEGER NOT NULL DEFAULT 5,
    "creadoEn" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venceEn" TIMESTAMP(6) NOT NULL,
    "retiradoEn" TIMESTAMP(6),
    CONSTRAINT "PrioridadDocente_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PrioridadDocente_claseId_fkey" FOREIGN KEY ("claseId") REFERENCES "Clase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrioridadDocente_meta_check" CHECK ("metaPreguntas" = 5 AND cardinality("preguntaIds") BETWEEN 5 AND 2000),
    CONSTRAINT "PrioridadDocente_plazo_check" CHECK ("venceEn" > "creadoEn" AND "venceEn" <= "creadoEn" + INTERVAL '30 days'),
    CONSTRAINT "PrioridadDocente_retiro_check" CHECK ("retiradoEn" IS NULL OR "retiradoEn" >= "creadoEn")
);
CREATE INDEX "PrioridadDocente_claseId_creadoEn_id_idx" ON "PrioridadDocente"("claseId", "creadoEn", "id");
CREATE INDEX "PrioridadDocente_claseId_retiradoEn_venceEn_idx" ON "PrioridadDocente"("claseId", "retiradoEn", "venceEn");

-- Solo el backend accede a esta tabla. Sin políticas públicas de Supabase.
ALTER TABLE "PrioridadDocente" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "PrioridadDocente" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "PrioridadDocente" FROM authenticated;
  END IF;
END $$;
