-- Dedicated scope for local CPU rounds. Existing attempts keep their modality.
ALTER TYPE "ModalidadTriviaRush" ADD VALUE 'TUG_LOCAL';

-- Preserve both existing evidence branches; admit only an isolated, noncompetitive
-- local attempt. No historical attempt can change its immutable modality.
ALTER TABLE "IntentoTriviaRush" DROP CONSTRAINT trivia_evidence_context;
ALTER TABLE "IntentoTriviaRush" ADD CONSTRAINT trivia_evidence_context CHECK (
  (
    modalidad::text IS DISTINCT FROM 'TUG_LOCAL' AND (
      ("evidenciaVersion" IS NULL AND modalidad IS NULL AND "snapshotInicial" IS NULL) OR
      ("evidenciaVersion" IS NOT NULL AND "evidenciaVersion" = 1 AND modalidad IS NOT NULL AND "snapshotInicial" IS NOT NULL
        AND "versionReglas" = 1 AND "duracionBaseSegundos" IN (60,90,120) AND "tiempoExtraSegundos" >= 0
        AND trivia_snapshot_valid("snapshotInicial", modalidad::text, to_jsonb(areas), "duracionBaseSegundos", "versionReglas")
        AND "venceEn" = "iniciadoEn" + ("duracionBaseSegundos" + "tiempoExtraSegundos") * interval '1 second'
        AND ((estado = 'ACTIVO' AND "finalizadoEn" IS NULL) OR (estado <> 'ACTIVO' AND "finalizadoEn" BETWEEN "iniciadoEn" AND "venceEn" AND "finalizadoEn" IS NOT NULL))
        AND (estado <> 'EXPIRADO' OR "finalizadoEn" = "venceEn"))
    )
  ) OR (
    modalidad::text = 'TUG_LOCAL' AND "evidenciaVersion" IS NULL AND "snapshotInicial" IS NULL
    AND "competitiveRulesVersion" IS NULL AND "competitiveAdmittedAt" IS NULL AND "competitiveSettledAt" IS NULL
    AND "presenciaVersion" IS NULL AND "duracionBaseSegundos" = 600 AND "tiempoExtraSegundos" = 0
    AND "venceEn" = "iniciadoEn" + interval '600 seconds' AND NOT asistido
    AND ((estado = 'ACTIVO' AND "finalizadoEn" IS NULL) OR (estado <> 'ACTIVO' AND "finalizadoEn" BETWEEN "iniciadoEn" AND "venceEn" AND "finalizadoEn" IS NOT NULL))
    AND (estado <> 'EXPIRADO' OR "finalizadoEn" = "venceEn")
  )
);
