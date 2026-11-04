ALTER TABLE "Usuario" ALTER COLUMN "correo" DROP NOT NULL;
ALTER TABLE "Usuario" ADD COLUMN "identificadorInstitucional" VARCHAR(254);
ALTER TABLE "Usuario" ADD COLUMN "versionSesion" INTEGER NOT NULL DEFAULT 0 CHECK ("versionSesion" >= 0);
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_identidad_presente" CHECK ("correo" IS NOT NULL OR "identificadorInstitucional" IS NOT NULL);
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_alias_canonico" CHECK ("identificadorInstitucional" IS NULL OR ("identificadorInstitucional" = lower(trim("identificadorInstitucional")) AND "identificadorInstitucional" <> ''));
CREATE UNIQUE INDEX "Usuario_identificadorInstitucional_key" ON "Usuario"("identificadorInstitucional");

-- One shared unique keyspace prevents cross-field races between personal email
-- and institutional alias. Values are identifiers, never proof of email ownership.
CREATE TABLE "IdentificadorLogin" (
  "valor" VARCHAR(255) PRIMARY KEY,
  "usuarioId" UUID NOT NULL REFERENCES "Usuario"("id") ON DELETE CASCADE,
  "tipo" VARCHAR(16) NOT NULL CHECK ("tipo" IN ('CORREO', 'INSTITUCIONAL')),
  UNIQUE ("usuarioId", "tipo")
);
INSERT INTO "IdentificadorLogin" ("valor", "usuarioId", "tipo")
  SELECT lower(trim("correo")), "id", 'CORREO' FROM "Usuario" WHERE "correo" IS NOT NULL;
-- Fail the migration on ambiguous pre-existing identifiers; never merge accounts.
CREATE FUNCTION sincronizar_identificadores_login() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "IdentificadorLogin" WHERE "usuarioId" = NEW."id";
  IF NEW."correo" IS NOT NULL THEN
    INSERT INTO "IdentificadorLogin" VALUES (lower(trim(NEW."correo")), NEW."id", 'CORREO');
  END IF;
  IF NEW."identificadorInstitucional" IS NOT NULL THEN
    INSERT INTO "IdentificadorLogin" VALUES (NEW."identificadorInstitucional", NEW."id", 'INSTITUCIONAL');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Usuario_sincronizar_login" AFTER INSERT OR UPDATE OF "correo", "identificadorInstitucional" ON "Usuario"
  FOR EACH ROW EXECUTE FUNCTION sincronizar_identificadores_login();
