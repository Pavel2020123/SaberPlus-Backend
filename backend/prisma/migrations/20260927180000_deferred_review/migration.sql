CREATE TABLE "RepasoDiferido" (
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tarjetaId" VARCHAR(200) NOT NULL,
  "contenidoVersion" VARCHAR(40) NOT NULL,
  "paso" INTEGER NOT NULL CHECK ("paso" BETWEEN 0 AND 4),
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "revisadoEn" TIMESTAMPTZ(3) NOT NULL,
  "venceEn" TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY ("usuarioId", "contenidoVersion", "tarjetaId"),
  CHECK ("venceEn" > "revisadoEn")
);
CREATE TABLE "EventoRepasoDiferido" (
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "eventoId" UUID NOT NULL,
  "huella" VARCHAR(64) NOT NULL,
  "resultado" JSONB NOT NULL,
  "creadoEn" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("usuarioId", "eventoId")
);
ALTER TABLE "RepasoDiferido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventoRepasoDiferido" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "RepasoDiferido", "EventoRepasoDiferido" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "RepasoDiferido", "EventoRepasoDiferido" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "RepasoDiferido", "EventoRepasoDiferido" FROM authenticated;
  END IF;
END $$;
