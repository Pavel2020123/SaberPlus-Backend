-- La evidencia institucional y las notas ADMIN se consultan solo por NestJS.
-- No modificar la migración anterior: puede haberse aplicado en otro ambiente.
ALTER TABLE "SolicitudAltaInstitucion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SolicitudAltaInstitucion" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "SolicitudAltaInstitucion" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "SolicitudAltaInstitucion" FROM authenticated;
  END IF;
END $$;
-- Sin políticas para clientes directos. No revocar al propietario Prisma:
-- la API aplica los permisos de profesor/ADMIN y conserva acceso de propietario.
