-- Punto 3 del roadmap: etiquetar cada grupo (Clase) por grado, para poder
-- descontar del cupo correspondiente (limiteGrado10 / limiteGrado11).

CREATE TYPE "Grado" AS ENUM ('DECIMO', 'ONCE');

-- Se agrega con default 'ONCE' para no romper grupos ya existentes,
-- y luego se quita el default: de ahora en adelante el grado es obligatorio.
ALTER TABLE "Clase"
ADD COLUMN "grado" "Grado" NOT NULL DEFAULT 'ONCE';

ALTER TABLE "Clase"
ALTER COLUMN "grado" DROP DEFAULT;