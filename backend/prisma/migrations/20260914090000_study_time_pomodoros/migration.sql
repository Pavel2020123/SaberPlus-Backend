CREATE TABLE "PomodoroRegistrado" (
    "usuarioId" UUID NOT NULL,
    "eventoId" VARCHAR(80) NOT NULL,
    "duracionSegundos" INTEGER NOT NULL DEFAULT 1500,
    "finalizadoEn" TIMESTAMP(3) NOT NULL,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PomodoroRegistrado_pkey" PRIMARY KEY ("usuarioId", "eventoId"),
    CONSTRAINT "PomodoroRegistrado_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PomodoroRegistrado_duracion_check" CHECK ("duracionSegundos" = 1500),
    CONSTRAINT "PomodoroRegistrado_evento_check" CHECK ("eventoId" ~ '^pomodoro:([0-9]{13,20}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$')
);
CREATE UNIQUE INDEX "PomodoroRegistrado_usuarioId_finalizadoEn_key" ON "PomodoroRegistrado"("usuarioId", "finalizadoEn");
ALTER TABLE "PomodoroRegistrado" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "PomodoroRegistrado" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "PomodoroRegistrado" FROM authenticated;
  END IF;
END $$;
