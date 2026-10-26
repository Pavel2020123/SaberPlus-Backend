-- Solo índice para referencias históricas: no modificar reglas ni evidencia.
CREATE INDEX "PartidaTiraAfloja_editorial_snapshot_idx"
  ON "PartidaTiraAfloja" USING GIN ("snapshotInicial" jsonb_path_ops);
