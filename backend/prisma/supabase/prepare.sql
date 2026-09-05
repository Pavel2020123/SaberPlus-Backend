-- Supabase instala uuid-ossp en el esquema `extensions`. Las migraciones
-- historicas de SaberPlus usan uuid_generate_v4() sin calificar el esquema,
-- por lo que el rol de Prisma debe buscar tambien en `extensions`.
ALTER ROLE "prisma" IN DATABASE "postgres"
SET search_path TO public, extensions;

-- Prisma fija `public` como search_path durante sus migraciones. Esta funcion
-- conserva las migraciones historicas sin duplicar ni mover la extension que
-- Supabase administra dentro de `extensions`.
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS uuid
LANGUAGE sql
VOLATILE
PARALLEL SAFE
AS $function$
  SELECT extensions.uuid_generate_v4();
$function$;
