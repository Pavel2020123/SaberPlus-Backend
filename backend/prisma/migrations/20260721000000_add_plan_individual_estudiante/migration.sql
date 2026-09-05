-- Punto 5 del roadmap: plan/suscripción del estudiante individual.
-- Guarda cuándo vence la prueba gratis (o el plan pagado, más adelante)
-- de un estudiante que NO pertenece a una institución.
ALTER TABLE "Usuario" ADD COLUMN "fechaVencimientoPlan" TIMESTAMP(6);