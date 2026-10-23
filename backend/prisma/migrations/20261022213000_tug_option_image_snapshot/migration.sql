-- C5-C2: validate optional option images against their original row; preserve legacy snapshots.
CREATE OR REPLACE FUNCTION tug_snapshot_original_valid(s jsonb, m "PartidaTiraAfloja")
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE e jsonb; q jsonb; r jsonb; b record; option_row "Respuesta"; n integer := 0; seen text[] := '{}'; assigned "TiraAflojaPregunta";
BEGIN
  IF s->>'version' IS DISTINCT FROM '1' OR jsonb_typeof(s->'qPartida') IS DISTINCT FROM 'number' OR (s->>'qPartida')::integer NOT BETWEEN 4 AND 20
    OR jsonb_typeof(s->'questions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(s->'questions') <> (s->>'qPartida')::integer
    OR s->'participants' IS DISTINCT FROM jsonb_build_object('A',m."jugadorAId",'B',m."jugadorBId")
    OR m."jugadorBId" IS NULL OR m."jugadorAId" = m."jugadorBId"
    OR s->'config'->'area' IS DISTINCT FROM to_jsonb(m)->'area'
    OR s->'config'->>'versionReglas' IS DISTINCT FROM '1' OR m."versionReglas" <> 1
    OR s->'config'->>'segundosPorRonda' IS DISTINCT FROM '10'
    OR s->'config'->>'pausaMs' IS DISTINCT FROM '1500'
    OR s->'config'->>'cuentaRegresivaMs' IS DISTINCT FROM '3000'
    OR s->'config'->>'posicionMeta' IS DISTINCT FROM '4'
    OR s->'config'->>'empateRapidezMs' IS DISTINCT FROM '200'
    OR (s->'config'->>'expiraEn')::timestamptz AT TIME ZONE 'UTC' IS DISTINCT FROM m."expiraEn"
    OR (SELECT count(*) FROM "TiraAflojaPregunta" WHERE "partidaId"=m.id) <> (s->>'qPartida')::integer
    THEN RETURN false; END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(s->'questions') LOOP
    n := n+1; q := e->'pregunta';
    SELECT * INTO assigned FROM "TiraAflojaPregunta" WHERE "partidaId"=m.id AND orden=n;
    IF assigned."preguntaId" IS NULL OR e->>'orden' IS DISTINCT FROM n::text
      OR e->>'preguntaId' IS DISTINCT FROM assigned."preguntaId"
      OR e->'opcionesOrden' IS DISTINCT FROM assigned."opcionesOrden"
      OR q->>'id' IS DISTINCT FROM assigned."preguntaId" OR assigned."preguntaId"=ANY(seen)
      OR jsonb_typeof(q->'respuestas') IS DISTINCT FROM 'array'
      OR jsonb_array_length(q->'respuestas') < 2
      OR jsonb_array_length(q->'respuestas') <> jsonb_array_length(e->'opcionesOrden')
      OR (SELECT count(*) FROM jsonb_array_elements(q->'respuestas') a WHERE a->'esCorrecta'='true'::jsonb) <> 1
      OR (SELECT count(DISTINCT a->>'id') FROM jsonb_array_elements(q->'respuestas') a) <> jsonb_array_length(q->'respuestas')
      THEN RETURN false; END IF;
    SELECT p.*, t.area, t.nombre AS tema, st.nombre AS subtema INTO b
      FROM "Pregunta" p JOIN "Subtema" st ON st.id=p."subtemaId" JOIN "Tema" t ON t.id=st."temaId" WHERE p.id=assigned."preguntaId";
    IF b.id IS NULL OR nullif(b.enunciado,'') IS NULL
      OR q->'enunciado' IS DISTINCT FROM to_jsonb(b.enunciado)
      OR q->'imagenUrl' IS DISTINCT FROM coalesce(to_jsonb(b."imagenUrl"),'null'::jsonb)
      OR q->'explicacion' IS DISTINCT FROM coalesce(to_jsonb(b.explicacion),'null'::jsonb)
      OR q->>'dificultad' IS DISTINCT FROM b.dificultad::text
      OR q->>'area' IS DISTINCT FROM b.area::text OR q->>'tema' IS DISTINCT FROM b.tema OR q->>'subtema' IS DISTINCT FROM b.subtema
      OR q->'contexto' IS DISTINCT FROM coalesce((SELECT jsonb_build_object('id',c.id,'titulo',c.titulo,'contexto',c.contexto,'imagenUrl',c."imagenUrl") FROM "CasoPregunta" c WHERE c.id=b."casoId"),'null'::jsonb)
      OR (SELECT count(*) FROM "Respuesta" WHERE "preguntaId"=b.id) <> jsonb_array_length(q->'respuestas')
      THEN RETURN false; END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(q->'respuestas') LOOP
      SELECT * INTO option_row FROM "Respuesta" WHERE id=r->>'id' AND "preguntaId"=b.id;
      IF option_row.id IS NULL OR nullif(option_row.texto,'') IS NULL
        OR (r - 'imagenUrl') IS DISTINCT FROM jsonb_build_object('id',option_row.id,'texto',option_row.texto,'esCorrecta',option_row."esCorrecta",'explicacion',option_row.explicacion)
        OR (r ? 'imagenUrl' AND r->'imagenUrl' IS DISTINCT FROM coalesce(to_jsonb(option_row."imagenUrl"),'null'::jsonb))
        THEN RETURN false; END IF;
    END LOOP;
    IF (SELECT jsonb_agg(a->>'id') FROM jsonb_array_elements(q->'respuestas') a) IS DISTINCT FROM e->'opcionesOrden' THEN RETURN false; END IF;
    seen := array_append(seen,b.id);
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
