CREATE TABLE "IntentoGuardian" (
  "id" UUID NOT NULL,
  "usuarioId" UUID NOT NULL,
  "area" "AreaIcfes" NOT NULL,
  "subtemaId" TEXT,
  "dificultad" "Dificultad" NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
  "preguntas" JSONB NOT NULL,
  "respuestas" JSONB NOT NULL DEFAULT '[]',
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "venceEn" TIMESTAMP(3) NOT NULL,
  "finalizadoEn" TIMESTAMP(3),
  CONSTRAINT "IntentoGuardian_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntentoGuardian_estado_check" CHECK ("estado" IN ('ACTIVO', 'VICTORIA', 'DERROTA', 'ABANDONADO', 'EXPIRADO')),
  CONSTRAINT "IntentoGuardian_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "IntentoGuardian_usuarioId_creadoEn_idx" ON "IntentoGuardian"("usuarioId", "creadoEn");
CREATE UNIQUE INDEX "IntentoGuardian_un_activo" ON "IntentoGuardian"("usuarioId") WHERE "estado" = 'ACTIVO';
-- Solo la API accede a snapshots con respuestas correctas.
ALTER TABLE "IntentoGuardian" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "IntentoGuardian" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "IntentoGuardian" FROM authenticated;
  END IF;
END $$;
