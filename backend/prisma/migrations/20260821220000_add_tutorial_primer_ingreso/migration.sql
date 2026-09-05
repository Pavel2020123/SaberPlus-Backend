-- Point 29: remember the onboarding version seen by each user and role.
ALTER TABLE "Usuario"
ADD COLUMN "tutorialEstudianteVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "tutorialProfesorVersion" INTEGER NOT NULL DEFAULT 0;
