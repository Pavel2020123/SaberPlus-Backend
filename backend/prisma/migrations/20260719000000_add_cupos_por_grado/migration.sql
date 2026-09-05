-- Cupos independientes por grado (10 y 11) en la institución.
-- NULL = sin límite fijo (planes "Colegio", cotización directa).
ALTER TABLE "Institucion"
ADD COLUMN "limiteGrado10" INTEGER;

ALTER TABLE "Institucion"
ADD COLUMN "limiteGrado11" INTEGER;