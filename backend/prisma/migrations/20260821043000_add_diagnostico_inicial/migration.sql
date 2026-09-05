ALTER TYPE "OrigenRespuesta" ADD VALUE IF NOT EXISTS 'DIAGNOSTICO';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NivelDiagnostico') THEN
    CREATE TYPE "NivelDiagnostico" AS ENUM ('POR_REFORZAR', 'EN_PROCESO', 'FORTALEZA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "DiagnosticoInicial" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "usuarioId" UUID NOT NULL,
  "preguntaIds" JSONB NOT NULL,
  "iniciadoEn" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completadoEn" TIMESTAMP(6),
  "totalPreguntas" INTEGER NOT NULL DEFAULT 0,
  "respuestasCorrectas" INTEGER,
  "porcentaje" DOUBLE PRECISION,
  "nivel" "NivelDiagnostico",
  CONSTRAINT "DiagnosticoInicial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiagnosticoInicial_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DiagnosticoInicial_usuarioId_key"
ON "DiagnosticoInicial"("usuarioId");

CREATE INDEX IF NOT EXISTS "DiagnosticoInicial_completadoEn_idx"
ON "DiagnosticoInicial"("completadoEn");

CREATE TABLE IF NOT EXISTS "DiagnosticoResultadoArea" (
  "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
  "diagnosticoId" UUID NOT NULL,
  "area" "AreaIcfes" NOT NULL,
  "totalPreguntas" INTEGER NOT NULL,
  "respuestasCorrectas" INTEGER NOT NULL,
  "porcentaje" DOUBLE PRECISION NOT NULL,
  "nivel" "NivelDiagnostico" NOT NULL,
  CONSTRAINT "DiagnosticoResultadoArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiagnosticoResultadoArea_diagnosticoId_fkey"
    FOREIGN KEY ("diagnosticoId") REFERENCES "DiagnosticoInicial"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DiagnosticoResultadoArea_diagnosticoId_area_key"
ON "DiagnosticoResultadoArea"("diagnosticoId", "area");

CREATE INDEX IF NOT EXISTS "DiagnosticoResultadoArea_area_nivel_idx"
ON "DiagnosticoResultadoArea"("area", "nivel");
