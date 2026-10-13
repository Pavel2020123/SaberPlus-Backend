CREATE TABLE "InstitucionLogo" (
  "institucionId" UUID PRIMARY KEY REFERENCES "Institucion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "contenido" BYTEA NOT NULL,
  CONSTRAINT "InstitucionLogo_size" CHECK (octet_length("contenido") BETWEEN 1 AND 204800)
);
ALTER TABLE "InstitucionLogo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "InstitucionLogo" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "InstitucionLogo" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "InstitucionLogo" FROM authenticated;
  END IF;
END $$;
