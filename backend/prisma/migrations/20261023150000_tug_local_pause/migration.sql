-- Preserve the existing local CPU pause with server-owned time and a version.
-- No timing fields or pause operation are enabled for Trivia/Ghost attempts.
ALTER TABLE "IntentoTriviaRush"
  ADD COLUMN "tiraLocalPausadaEn" timestamp(6),
  ADD COLUMN "tiraLocalRondaVersion" integer NOT NULL DEFAULT 0;

ALTER TABLE "IntentoTriviaRush" ADD CONSTRAINT tug_local_pause_scope CHECK (
  (modalidad::text IS NOT DISTINCT FROM 'TUG_LOCAL' AND "tiraLocalRondaVersion" >= 0 AND (
    "tiraLocalPausadaEn" IS NULL OR (
      estado = 'ACTIVO' AND "preguntaActualId" IS NOT NULL
      AND "preguntaIniciaEn" IS NOT NULL
      AND "tiraLocalPausadaEn" >= "preguntaIniciaEn"
      AND "tiraLocalPausadaEn" < "preguntaIniciaEn" + interval '10 seconds'
      AND "tiraLocalPausadaEn" < "venceEn"
    )
  )) OR (
    modalidad::text IS DISTINCT FROM 'TUG_LOCAL'
    AND "tiraLocalPausadaEn" IS NULL AND "tiraLocalRondaVersion" = 0
  )
);
