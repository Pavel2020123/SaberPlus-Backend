-- C5-A: solo metadatos y recibos. El adaptador local no publica archivos.
CREATE TYPE "EstadoArchivoEditorial" AS ENUM ('PREPARADO', 'DISPONIBLE', 'RETIRADO');
CREATE TYPE "AutorizacionArchivoEditorial" AS ENUM ('ORIGINAL', 'LICENCIA', 'DOMINIO_PUBLICO', 'AUTORIZACION_ESCRITA');

CREATE TABLE "ArchivoEditorial" (
  "id" UUID NOT NULL,
  "operacionId" UUID NOT NULL,
  "creadoPorId" UUID NOT NULL,
  "huellaSolicitud" CHAR(64) NOT NULL,
  "estado" "EstadoArchivoEditorial" NOT NULL DEFAULT 'PREPARADO',
  "titulo" VARCHAR(120) NOT NULL,
  "textoAlternativo" VARCHAR(500) NOT NULL,
  "fuente" VARCHAR(500) NOT NULL,
  "titular" VARCHAR(255) NOT NULL,
  "autorizacion" "AutorizacionArchivoEditorial" NOT NULL,
  "referenciaAutorizacion" VARCHAR(2000),
  "sha256" CHAR(64) NOT NULL,
  "bytes" INTEGER NOT NULL,
  "ancho" INTEGER NOT NULL,
  "alto" INTEGER NOT NULL,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actualizadoEn" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ArchivoEditorial_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArchivoEditorial_bytes_check" CHECK ("bytes" > 0 AND "bytes" <= 2097152),
  CONSTRAINT "ArchivoEditorial_dimensiones_check" CHECK ("ancho" > 0 AND "alto" > 0 AND "ancho" <= 2560 AND "alto" <= 2560)
);
CREATE UNIQUE INDEX "ArchivoEditorial_operacionId_key" ON "ArchivoEditorial"("operacionId");
CREATE INDEX "ArchivoEditorial_creadoPorId_estado_creadoEn_idx" ON "ArchivoEditorial"("creadoPorId", "estado", "creadoEn");
ALTER TABLE "ArchivoEditorial" ADD CONSTRAINT "ArchivoEditorial_creadoPorId_fkey"
  FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Las cuentas de la API usan su guarda ADMIN; PostgREST no accede a estos recibos.
ALTER TABLE "ArchivoEditorial" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ArchivoEditorial" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "ArchivoEditorial" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "ArchivoEditorial" FROM authenticated;
  END IF;
END $$;
