CREATE TABLE "IntentoRescateEstrellas" (
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
  CONSTRAINT "IntentoRescateEstrellas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntentoRescateEstrellas_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "IntentoRescateEstrellas_version_check" CHECK ("version" = 1),
  CONSTRAINT "IntentoRescateEstrellas_estado_check" CHECK ("estado" IN ('ACTIVO', 'VICTORIA', 'AGOTADO', 'ABANDONADO', 'EXPIRADO')),
  CONSTRAINT "IntentoRescateEstrellas_preguntas_check" CHECK (jsonb_typeof("preguntas") = 'array' AND jsonb_array_length("preguntas") = 10),
  CONSTRAINT "IntentoRescateEstrellas_respuestas_check" CHECK (jsonb_typeof("respuestas") = 'array' AND jsonb_array_length("respuestas") <= 10),
  CONSTRAINT "IntentoRescateEstrellas_fechas_check" CHECK ("venceEn" > "creadoEn" AND ("estado" = 'ACTIVO') = ("finalizadoEn" IS NULL))
);
CREATE INDEX "IntentoRescateEstrellas_usuarioId_creadoEn_idx" ON "IntentoRescateEstrellas"("usuarioId", "creadoEn");
CREATE UNIQUE INDEX "IntentoRescateEstrellas_un_activo" ON "IntentoRescateEstrellas"("usuarioId") WHERE "estado" = 'ACTIVO';
-- Solo el backend accede a snapshots y soluciones. Sin políticas para clientes.
ALTER TABLE "IntentoRescateEstrellas" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "IntentoRescateEstrellas" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "IntentoRescateEstrellas" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "IntentoRescateEstrellas" FROM authenticated;
  END IF;
END $$;
