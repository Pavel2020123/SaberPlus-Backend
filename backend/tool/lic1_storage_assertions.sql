-- Constraint probes roll back all fixtures. This is not service authorization QA.
BEGIN;
DO $$
DECLARE
  institution UUID := '20000000-0000-4000-8000-000000000001';
  student UUID := '30000000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO "Institucion" (id, nombre, "codigoUnico") VALUES (institution, 'LIC1 fixture', 'LIC1-fixture');
  INSERT INTO "Usuario" (id, nombre, correo, "contrasenaHash") VALUES (student, 'Synthetic', 'lic1-fixture@example.invalid', 'not-a-login-hash');
  IF EXISTS (SELECT 1 FROM "ControlLicenciaInstitucional" WHERE "institucionId" = institution) THEN
    RAISE EXCEPTION 'Legacy institution automatically opted in';
  END IF;
  INSERT INTO "ControlLicenciaInstitucional" ("institucionId") VALUES (institution);
  BEGIN
    INSERT INTO "PeriodoContratoInstitucional" (id, "institucionId", inicio, fin, meses, "cuposEstudiantes", "cuposDocentes", "referenciaAcuerdo")
    VALUES (gen_random_uuid(), institution, now(), now() - interval '1 day', 6, 75, 3, 'fixture');
    RAISE EXCEPTION 'Invalid period accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "PeriodoContratoInstitucional" (id, "institucionId", inicio, fin, meses, "cuposEstudiantes", "cuposDocentes", "referenciaAcuerdo")
    VALUES (gen_random_uuid(), institution, now(), now() + interval '6 months', 6, -1, 3, 'fixture');
    RAISE EXCEPTION 'Negative quota accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "AsignacionLicenciaInstitucional" (id, "institucionId", "usuarioId", tipo, estado, "actualizadoEn")
    VALUES (gen_random_uuid(), institution, student, 'ESTUDIANTE', 'ACTIVA', now());
    RAISE EXCEPTION 'Active assignment without acceptance accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO "AsignacionLicenciaInstitucional" (id, "institucionId", "usuarioId", tipo, estado, "aceptadaEn", "actualizadoEn")
  VALUES (gen_random_uuid(), institution, student, 'ESTUDIANTE', 'ACTIVA', now(), now());
  BEGIN
    DELETE FROM "Usuario" WHERE id = student;
    RAISE EXCEPTION 'Traceable student deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  UPDATE "AsignacionLicenciaInstitucional" SET estado = 'RETIRADA', "retiradaEn" = now() WHERE "usuarioId" = student;
  IF NOT EXISTS (SELECT 1 FROM "Usuario" WHERE id = student) THEN RAISE EXCEPTION 'Retirement deleted user'; END IF;
END $$;
ROLLBACK;
