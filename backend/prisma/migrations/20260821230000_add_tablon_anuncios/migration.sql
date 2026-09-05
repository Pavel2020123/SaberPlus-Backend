-- Point 31: in-app announcements segmented by audience with per-user read state.
CREATE TYPE "TipoAnuncio" AS ENUM ('INFORMACION', 'IMPORTANTE', 'EVENTO');
CREATE TYPE "AudienciaAnuncio" AS ENUM ('TODOS', 'ESTUDIANTES', 'PROFESORES');

CREATE TABLE "Anuncio" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "titulo" VARCHAR(120) NOT NULL,
    "contenido" TEXT NOT NULL,
    "tipo" "TipoAnuncio" NOT NULL DEFAULT 'INFORMACION',
    "audiencia" "AudienciaAnuncio" NOT NULL DEFAULT 'TODOS',
    "fechaInicio" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaFin" TIMESTAMP(6),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "destacado" BOOLEAN NOT NULL DEFAULT false,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaEdicion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Anuncio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnuncioLectura" (
    "anuncioId" UUID NOT NULL,
    "usuarioId" UUID NOT NULL,
    "fechaLectura" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnuncioLectura_pkey" PRIMARY KEY ("anuncioId", "usuarioId")
);

CREATE INDEX "Anuncio_activo_fechaInicio_fechaFin_idx"
ON "Anuncio"("activo", "fechaInicio", "fechaFin");
CREATE INDEX "Anuncio_audiencia_destacado_idx"
ON "Anuncio"("audiencia", "destacado");
CREATE INDEX "AnuncioLectura_usuarioId_fechaLectura_idx"
ON "AnuncioLectura"("usuarioId", "fechaLectura");

ALTER TABLE "AnuncioLectura"
ADD CONSTRAINT "AnuncioLectura_anuncioId_fkey"
FOREIGN KEY ("anuncioId") REFERENCES "Anuncio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnuncioLectura"
ADD CONSTRAINT "AnuncioLectura_usuarioId_fkey"
FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
