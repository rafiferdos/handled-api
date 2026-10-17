BEGIN;
-- Locks make logout/account revocation serialize with an admitted mutation.
-- The runtime role must not receive managed Auth UPDATE privileges just to lock.
-- The migration owner needs SELECT and row-lock privileges on managed Auth;
-- auth.* remains entirely outside application migration ownership.
CREATE FUNCTION handled.active_identity(p_user_id uuid, p_session_id uuid)
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT u.id, lower(btrim(u.email::text)) FROM auth.users u
    JOIN auth.sessions s ON s.user_id = u.id
    WHERE u.id = p_user_id AND s.id = p_session_id
      AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL
      AND u.deleted_at IS NULL
      AND (u.banned_until IS NULL OR u.banned_until <= clock_timestamp())
      AND (s.not_after IS NULL OR s.not_after > clock_timestamp())
    FOR SHARE OF u, s;
END;
$$;
REVOKE ALL ON FUNCTION handled.active_identity(uuid, uuid) FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION handled.active_identity(uuid, uuid) FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
