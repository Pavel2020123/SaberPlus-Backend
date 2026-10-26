-- H2A: consultas por propietario y contención en campos públicos conocidos.
CREATE INDEX "IntentoCima_editorial_snapshot_idx"
  ON "IntentoCima" USING GIN ("preguntas" jsonb_path_ops);
CREATE INDEX "IntentoGuardian_editorial_snapshot_idx"
  ON "IntentoGuardian" USING GIN ("preguntas" jsonb_path_ops);
CREATE INDEX "IntentoRescateEstrellas_editorial_snapshot_idx"
  ON "IntentoRescateEstrellas" USING GIN ("preguntas" jsonb_path_ops);

-- El formato original y su dueño no se reescriben al responder/expirar. No
-- reconstruir referencias antiguas desde el banco ni modificar XP o resultados.
CREATE FUNCTION proteger_snapshot_editorial_solo() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."preguntas" IS DISTINCT FROM OLD."preguntas"
    OR NEW."usuarioId" IS DISTINCT FROM OLD."usuarioId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."id" IS DISTINCT FROM OLD."id" THEN
    RAISE EXCEPTION 'La versión original de la partida es inmutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "IntentoCima_snapshot_editorial_inmutable"
  BEFORE UPDATE ON "IntentoCima" FOR EACH ROW EXECUTE FUNCTION proteger_snapshot_editorial_solo();
CREATE TRIGGER "IntentoGuardian_snapshot_editorial_inmutable"
  BEFORE UPDATE ON "IntentoGuardian" FOR EACH ROW EXECUTE FUNCTION proteger_snapshot_editorial_solo();
CREATE TRIGGER "IntentoRescateEstrellas_snapshot_editorial_inmutable"
  BEFORE UPDATE ON "IntentoRescateEstrellas" FOR EACH ROW EXECUTE FUNCTION proteger_snapshot_editorial_solo();
REVOKE EXECUTE ON FUNCTION proteger_snapshot_editorial_solo() FROM PUBLIC;
