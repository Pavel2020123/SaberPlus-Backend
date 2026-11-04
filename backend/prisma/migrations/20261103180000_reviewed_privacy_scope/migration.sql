-- Explicit reviewed suppression; never a general bypass of evidence guards.
CREATE FUNCTION sp_lic4_execution_target() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT r."usuarioId" FROM "SolicitudSupresionCuenta" r
  JOIN "Usuario" a ON a.id = r."revisorId"
  JOIN "Usuario" u ON u.id = r."usuarioId"
  WHERE r.id::text = current_setting('saberplus.privacy_request', true)
    AND a.id::text = current_setting('saberplus.privacy_actor', true)
    AND a.rol = 'ADMIN' AND a."suprimidaEn" IS NULL
    AND NOT coalesce(a."debeCambiarContrasena", false)
    AND r.estado = 'EJECUTADA' AND r."ejecutadoEn" IS NOT NULL
    AND u."suprimidaEn" IS NULL
$$;

CREATE FUNCTION sp_lic4_redact_payload(value jsonb, target_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE result jsonb; item record; identity_value text; text_value text;
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(value) = 'object' THEN
    result := '{}'::jsonb;
    FOR item IN SELECT key, val FROM jsonb_each(value) AS x(key,val) LOOP
      result := result || jsonb_build_object(item.key, sp_lic4_redact_payload(item.val,target_id));
    END LOOP;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'array' THEN
    SELECT coalesce(jsonb_agg(sp_lic4_redact_payload(x,target_id)), '[]'::jsonb) INTO result FROM jsonb_array_elements(value) x;
    RETURN result;
  ELSIF jsonb_typeof(value) = 'string' THEN
    text_value := value #>> '{}';
    SELECT nombre INTO identity_value FROM "Usuario" WHERE id=target_id;
    IF lower(text_value)=lower(identity_value) THEN RETURN '"Dato eliminado"'::jsonb; END IF;
    FOR identity_value IN SELECT unnest(ARRAY[u.correo,u."identificadorInstitucional",u."fotoPerfil"])
      FROM "Usuario" u WHERE u.id = target_id LOOP
      IF identity_value IS NOT NULL AND length(identity_value)>0
        AND position(lower(identity_value) in lower(text_value))>0 THEN RETURN '"Dato eliminado"'::jsonb; END IF;
    END LOOP;
  END IF;
  RETURN value;
END $$;

CREATE FUNCTION sp_lic4_private_delete_scope(table_name text, row_data jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE target_id uuid; attempt_user uuid;
BEGIN
  target_id := sp_lic4_execution_target();
  IF target_id IS NULL THEN RETURN false; END IF;
  IF table_name IN ('IntentoTriviaRush','IntentoGuardian','IntentoCima','IntentoRescateEstrellas','IntentoEscudoConocimiento','ConcesionRecompensaJuego') THEN
    RETURN row_data->>'usuarioId'=target_id::text;
  END IF;
  IF table_name IN ('TriviaRushPregunta','TriviaRushRespuesta','TriviaRushPotenciador','TriviaPresence','TriviaConnection','TriviaPresenceEvent') THEN
    SELECT "usuarioId" INTO attempt_user FROM "IntentoTriviaRush"
      WHERE id::text=coalesce(row_data->>'intentoId',row_data->>'attemptId');
    RETURN coalesce(attempt_user=target_id,false);
  END IF;
  RETURN false;
END $$;

CREATE FUNCTION sp_lic4_shared_redaction_scope(table_name text, old_row jsonb, new_row jsonb) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE target_id uuid;
BEGIN
  target_id := sp_lic4_execution_target();
  IF target_id IS NULL THEN RETURN false; END IF;
  IF table_name='TiraAflojaEvento' THEN
    IF NOT EXISTS (SELECT 1 FROM "PartidaTiraAfloja" p WHERE p.id::text=old_row->>'partidaId'
      AND (p."jugadorAId"=target_id OR p."jugadorBId"=target_id)) THEN RETURN false; END IF;
    RETURN (new_row-'datos')=(old_row-'datos')
      AND new_row->'datos'=sp_lic4_redact_payload(old_row->'datos',target_id);
  ELSIF table_name='EventoXpCompetitivo' THEN
    RETURN (old_row->>'usuarioId'=target_id::text OR old_row->>'actorId'=target_id::text)
      AND (new_row-'metadata'-'motivo')=(old_row-'metadata'-'motivo')
      AND new_row->'metadata'=sp_lic4_redact_payload(old_row->'metadata',target_id)
      AND new_row->'motivo'=sp_lic4_redact_payload(old_row->'motivo',target_id);
  END IF;
  RETURN false;
END $$;

-- Preserve each existing trigger body verbatim. Add only a scoped DELETE or
-- exact PII-redaction exception, authorized by the same reviewed transaction.
DO $$
DECLARE fn record; definition text;
BEGIN
  FOR fn IN SELECT DISTINCT p.oid FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname='public' AND (t.tgtype & 1)=1 AND (t.tgtype & 24)<>0
      AND c.relname IN ('IntentoTriviaRush','TriviaRushPregunta','TriviaRushRespuesta','TriviaRushPotenciador',
        'TriviaPresence','TriviaConnection','TriviaPresenceEvent','IntentoGuardian','IntentoCima',
        'IntentoRescateEstrellas','IntentoEscudoConocimiento','ConcesionRecompensaJuego','TiraAflojaEvento','EventoXpCompetitivo')
  LOOP
    definition := pg_get_functiondef(fn.oid);
    IF position('BEGIN' in definition)=0 THEN RAISE EXCEPTION 'Unsupported privacy trigger body'; END IF;
    definition := regexp_replace(definition, 'BEGIN', $prefix$BEGIN
      IF TG_OP='DELETE' THEN
        IF sp_lic4_private_delete_scope(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;
      ELSIF TG_OP='UPDATE' THEN
        IF sp_lic4_shared_redaction_scope(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
      END IF;
    $prefix$);
    EXECUTE definition;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION sp_lic4_execution_target(),sp_lic4_redact_payload(jsonb,uuid),sp_lic4_private_delete_scope(text,jsonb),sp_lic4_shared_redaction_scope(text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

-- Serialize private writes with suppression even if authentication happened
-- before the transaction. A stale request must not recreate deleted progress.
CREATE FUNCTION sp_lic4_require_live_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; suppressed timestamptz;
BEGIN
  target_id := (to_jsonb(NEW)->>TG_ARGV[0])::uuid;
  SELECT "suprimidaEn" INTO suppressed FROM "Usuario" WHERE id=target_id FOR KEY SHARE;
  IF NOT FOUND OR suppressed IS NOT NULL THEN RAISE EXCEPTION 'Cuenta suprimida: escritura privada denegada' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['HistorialRespuesta','DiagnosticoInicial','PlanEstudioSemanal','ResultadoSimulacro','IntentoSimulacro','ProgresoTema',
    'CuadernoError','PomodoroRegistrado','RepasoDiferido','EventoRepasoDiferido','IntentoTriviaRush','IntentoGuardian','IntentoCima',
    'IntentoRescateEstrellas','IntentoEscudoConocimiento','ConcesionRecompensaJuego','IdentificadorLogin'] LOOP
    EXECUTE format('CREATE TRIGGER sp_lic4_live_user BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION sp_lic4_require_live_user(''usuarioId'')',table_name);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION sp_lic4_require_live_user() FROM PUBLIC,anon,authenticated;
