-- Point 28: stable weekly study plans driven by the initial diagnostic and exam date.
CREATE TYPE "TipoActividadPlan" AS ENUM ('ESTUDIO', 'SIMULACRO', 'DESCANSO', 'EXAMEN');

CREATE TABLE "PlanEstudioSemanal" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "usuarioId" UUID NOT NULL,
    "diagnosticoId" UUID NOT NULL,
    "calendarioIcfes" "CalendarioTipo" NOT NULL,
    "fechaExamen" DATE NOT NULL,
    "inicioSemana" DATE NOT NULL,
    "finSemana" DATE NOT NULL,
    "diasRestantesAlGenerar" INTEGER NOT NULL,
    "sesionesObjetivo" INTEGER NOT NULL,
    "minutosObjetivoSemanal" INTEGER NOT NULL,
    "fechaCreacion" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanEstudioSemanal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanEstudioActividad" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "planId" UUID NOT NULL,
    "subtemaId" TEXT,
    "fecha" DATE NOT NULL,
    "tipo" "TipoActividadPlan" NOT NULL,
    "area" "AreaIcfes",
    "titulo" VARCHAR(180) NOT NULL,
    "detalle" VARCHAR(300) NOT NULL,
    "minutos" INTEGER NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "PlanEstudioActividad_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanEstudioSemanal_usuarioId_inicioSemana_key" ON "PlanEstudioSemanal"("usuarioId", "inicioSemana");
CREATE INDEX "PlanEstudioSemanal_diagnosticoId_idx" ON "PlanEstudioSemanal"("diagnosticoId");
CREATE UNIQUE INDEX "PlanEstudioActividad_planId_fecha_key" ON "PlanEstudioActividad"("planId", "fecha");
CREATE INDEX "PlanEstudioActividad_subtemaId_idx" ON "PlanEstudioActividad"("subtemaId");

ALTER TABLE "PlanEstudioSemanal" ADD CONSTRAINT "PlanEstudioSemanal_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanEstudioSemanal" ADD CONSTRAINT "PlanEstudioSemanal_diagnosticoId_fkey" FOREIGN KEY ("diagnosticoId") REFERENCES "DiagnosticoInicial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanEstudioActividad" ADD CONSTRAINT "PlanEstudioActividad_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanEstudioSemanal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanEstudioActividad" ADD CONSTRAINT "PlanEstudioActividad_subtemaId_fkey" FOREIGN KEY ("subtemaId") REFERENCES "Subtema"("id") ON DELETE SET NULL ON UPDATE CASCADE;
