-- Prisma Migrate usa pg_advisory_lock(72707369). Esta consulta se reserva para
-- recuperar un despliegue interrumpido y solo termina otra sesion del mismo rol
-- que conserve exactamente esa llave.
SELECT pg_terminate_backend(pid)
FROM pg_locks
WHERE locktype = 'advisory'
  AND classid = 0
  AND objid = 72707369
  AND granted = true
  AND pid <> pg_backend_pid();
