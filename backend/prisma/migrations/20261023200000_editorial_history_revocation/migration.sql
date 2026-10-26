-- C5-H1. Sin backfill: las asociaciones actuales no prueban una imagen pasada.
CREATE TYPE "MotivoRevocacionArchivo" AS ENUM ('SEGURIDAD', 'DERECHOS');
CREATE TYPE "RolImagenHistorial" AS ENUM ('SELECCIONADA', 'CORRECTA');

CREATE TABLE "RevocacionArchivoEditorial" (
  "archivoId" UUID NOT NULL PRIMARY KEY,
  "operacionId" UUID NOT NULL UNIQUE,
  "actorId" UUID NOT NULL,
  "huellaSolicitud" CHAR(64) NOT NULL,
  "motivo" "MotivoRevocacionArchivo" NOT NULL,
  "detalle" VARCHAR(500) NOT NULL CHECK (length(btrim("detalle")) BETWEEN 1 AND 500),
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RevocacionArchivoEditorial_archivoId_fkey" FOREIGN KEY ("archivoId")
    REFERENCES "ArchivoEditorial"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- actorId es una instantánea de auditoría, no un dato enviado por el estudiante.
-- No se borra el recibo si más adelante se elimina la cuenta administradora.
CREATE TABLE "ImagenHistorialRespuesta" (
  "historialId" UUID NOT NULL,
  "rol" "RolImagenHistorial" NOT NULL,
  "usuarioId" UUID NOT NULL,
  "respuestaId" TEXT NOT NULL,
  "archivoId" UUID NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  CONSTRAINT "ImagenHistorialRespuesta_pkey" PRIMARY KEY ("historialId", "rol"),
  CONSTRAINT "ImagenHistorialRespuesta_historialId_fkey" FOREIGN KEY ("historialId")
    REFERENCES "HistorialRespuesta"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ImagenHistorialRespuesta_archivoId_fkey" FOREIGN KEY ("archivoId")
    REFERENCES "ArchivoEditorial"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ImagenHistorialRespuesta_archivoId_usuarioId_idx"
  ON "ImagenHistorialRespuesta"("archivoId", "usuarioId");

-- Una captura por rol, exclusivamente desde una respuesta de esa pregunta.
-- El disparador cubre también createMany y todos los escritores del historial.
-- No modifica el resultado académico ni guarda referencias a otras opciones.
CREATE FUNCTION capturar_imagenes_historial() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO "ImagenHistorialRespuesta"
    ("historialId", "rol", "usuarioId", "respuestaId", "archivoId", "sha256")
  SELECT NEW."id", v.rol, NEW."usuarioId", r."id", a."id", a."sha256"
  FROM (VALUES
    ('SELECCIONADA'::"RolImagenHistorial", NEW."respuestaSeleccionadaId"),
    ('CORRECTA'::"RolImagenHistorial", NEW."respuestaCorrectaId")
  ) AS v(rol, respuesta)
  JOIN "Respuesta" r ON r."id" = v.respuesta AND r."preguntaId" = NEW."preguntaId"
  JOIN "ArchivoEditorial" a ON a."id" = r."archivoImagenId"
  WHERE a."estado" = 'DISPONIBLE'
    AND r."imagenUrl" = '/recursos/editoriales/' || a."id"::text
    AND (v.rol <> 'CORRECTA' OR r."esCorrecta")
    AND NOT EXISTS (SELECT 1 FROM "RevocacionArchivoEditorial" x WHERE x."archivoId" = a."id");
  RETURN NEW;
END $$;
CREATE TRIGGER "HistorialRespuesta_capturar_imagenes"
  AFTER INSERT ON "HistorialRespuesta"
  FOR EACH ROW EXECUTE FUNCTION capturar_imagenes_historial();

-- Los recibos y la prueba histórica no tienen API directa de edición.
-- Denegar también UPDATE accidental con el rol de la API; una restauración
-- exigiría una operación explícita futura, no un reintento de carga.
CREATE FUNCTION impedir_edicion_recibo_editorial() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El recibo editorial es inmutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "RevocacionArchivoEditorial_inmutable"
  BEFORE UPDATE OR DELETE ON "RevocacionArchivoEditorial"
  FOR EACH ROW EXECUTE FUNCTION impedir_edicion_recibo_editorial();
CREATE TRIGGER "ImagenHistorialRespuesta_inmutable"
  BEFORE UPDATE ON "ImagenHistorialRespuesta"
  FOR EACH ROW EXECUTE FUNCTION impedir_edicion_recibo_editorial();

ALTER TABLE "RevocacionArchivoEditorial" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImagenHistorialRespuesta" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RevocacionArchivoEditorial", "ImagenHistorialRespuesta" FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION capturar_imagenes_historial(), impedir_edicion_recibo_editorial() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "RevocacionArchivoEditorial", "ImagenHistorialRespuesta" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "RevocacionArchivoEditorial", "ImagenHistorialRespuesta" FROM authenticated;
  END IF;
END $$;
