ALTER TABLE "Institucion"
ADD COLUMN "limiteGrupos" INTEGER;

UPDATE "Institucion"
SET "limiteGrupos" = CASE
  WHEN UPPER(COALESCE("planActual", 'GRATIS')) = 'GRATIS' THEN 1
  ELSE 5
END
WHERE "limiteGrupos" IS NULL;

UPDATE "Institucion"
SET "limiteEstudiantes" = CASE
  WHEN UPPER(COALESCE("planActual", 'GRATIS')) = 'GRATIS' THEN 40
  ELSE 200
END
WHERE "limiteEstudiantes" IS NOT NULL
  AND "limiteEstudiantes" < 1;

ALTER TABLE "Institucion"
ADD CONSTRAINT "Institucion_limiteGrupos_check"
CHECK ("limiteGrupos" IS NULL OR "limiteGrupos" >= 1);

ALTER TABLE "Institucion"
ADD CONSTRAINT "Institucion_limiteEstudiantes_check"
CHECK ("limiteEstudiantes" IS NULL OR "limiteEstudiantes" >= 1);
