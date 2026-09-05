ALTER TABLE "CalendarioIcfes"
ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Institucion"
ADD COLUMN IF NOT EXISTS "limiteEstudiantes" INTEGER;

UPDATE "Institucion"
SET "limiteEstudiantes" =
  COALESCE("limiteGrado10", 0) + COALESCE("limiteGrado11", 0)
WHERE "limiteEstudiantes" IS NULL
  AND ("limiteGrado10" IS NOT NULL OR "limiteGrado11" IS NOT NULL);

ALTER TABLE "PagoOrden"
ALTER COLUMN "grado" DROP NOT NULL;

ALTER TABLE "PagoOrden"
ADD COLUMN IF NOT EXISTS "calendarioIcfes" "CalendarioTipo",
ADD COLUMN IF NOT EXISTS "fechaVencimientoAcceso" TIMESTAMP(6);

WITH "candidata" AS (
  SELECT "id"
  FROM "CalendarioIcfes"
  ORDER BY
    ("fechaExamen" >= CURRENT_DATE) DESC,
    CASE WHEN "fechaExamen" >= CURRENT_DATE THEN "fechaExamen" END ASC,
    "fechaExamen" DESC
  LIMIT 1
)
UPDATE "CalendarioIcfes"
SET "activo" = true
WHERE "id" = (SELECT "id" FROM "candidata")
  AND NOT EXISTS (
    SELECT 1 FROM "CalendarioIcfes" WHERE "activo" = true
  );

CREATE INDEX IF NOT EXISTS "CalendarioIcfes_activo_fechaExamen_idx"
ON "CalendarioIcfes" ("activo", "fechaExamen");
