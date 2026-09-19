CREATE TABLE "IntentoCima" (
  "id" UUID NOT NULL,
  "usuarioId" UUID NOT NULL,
  "area" "AreaIcfes" NOT NULL,
  "temaId" TEXT,
  "subtemaId" TEXT,
  "dificultad" "Dificultad",
  "version" INTEGER NOT NULL DEFAULT 1,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  "preguntas" JSONB NOT NULL,
  "respuestas" JSONB NOT NULL DEFAULT '[]',
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "venceEn" TIMESTAMP(3) NOT NULL,
  "finalizadoEn" TIMESTAMP(3),
  CONSTRAINT "IntentoCima_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntentoCima_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IntentoCima_version_check" CHECK ("version" = 1),
  CONSTRAINT "IntentoCima_estado_check" CHECK ("estado" IN ('ACTIVO', 'VICTORIA', 'AGOTADO', 'ABANDONADO', 'EXPIRADO')),
  CONSTRAINT "IntentoCima_preguntas_check" CHECK (jsonb_typeof("preguntas") = 'array' AND jsonb_array_length("preguntas") = 12),
  CONSTRAINT "IntentoCima_respuestas_check" CHECK (jsonb_typeof("respuestas") = 'array' AND jsonb_array_length("respuestas") <= 12),
  CONSTRAINT "IntentoCima_fechas_check" CHECK ("venceEn" > "creadoEn" AND ("estado" = 'ACTIVO') = ("finalizadoEn" IS NULL))
);
CREATE INDEX "IntentoCima_usuarioId_creadoEn_idx" ON "IntentoCima"("usuarioId", "creadoEn");
CREATE UNIQUE INDEX "IntentoCima_un_activo" ON "IntentoCima"("usuarioId") WHERE "estado" = 'ACTIVO';
-- Solo el backend accede a snapshots y soluciones. Sin políticas para clientes.
ALTER TABLE "IntentoCima" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "IntentoCima" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "IntentoCima" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "IntentoCima" FROM authenticated;
  END IF;
END $$;
