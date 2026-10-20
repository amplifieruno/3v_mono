-- Restores check_file_bucket without the queue check and the unscoped claim_file_deletions(p_limit).
CREATE OR REPLACE FUNCTION itap.check_file_bucket()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  col text;
  new_value uuid;
  old_value uuid;
  file_bucket text;
  file_kind text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF NOT (to_jsonb(NEW) ? col) THEN
      RAISE EXCEPTION USING ERRCODE = 'undefined_column', MESSAGE = 'check_file_bucket: unknown column ' || col;
    END IF;
    new_value := (to_jsonb(NEW) ->> col)::uuid;
    IF TG_OP = 'UPDATE' THEN
      old_value := (to_jsonb(OLD) ->> col)::uuid;
    ELSE
      old_value := NULL;
    END IF;
    IF new_value IS NOT NULL AND (TG_OP = 'INSERT' OR new_value IS DISTINCT FROM old_value) THEN
      SELECT f.bucket_id, f.metadata ->> 'kind' INTO file_bucket, file_kind FROM storage.files f WHERE f.id = new_value;
      IF NOT FOUND OR file_bucket IS DISTINCT FROM NEW.organization_id::text THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_not_in_org_bucket:' || col;
      END IF;
      IF file_kind = ANY (itap.owner_only_file_kinds()) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', MESSAGE = 'file_owner_only:' || col;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$
;

DROP FUNCTION itap.claim_file_deletions(integer, uuid);
CREATE FUNCTION itap.claim_file_deletions(p_limit integer DEFAULT 500)
 RETURNS SETOF itap.pending_file_deletions
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  q itap.pending_file_deletions;
  claimed integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 5000 THEN
    PERFORM itap.raise_code('file_deletion_limit_invalid');
  END IF;
  FOR q IN
    SELECT * FROM itap.pending_file_deletions x
    WHERE x.attempts < 10 AND (x.lease_expires_at IS NULL OR x.lease_expires_at <= now())
      AND (x.attempts = 0 OR x.last_attempt_at IS NULL
           OR x.last_attempt_at + least(power(2, x.attempts) * interval '1 minute', interval '6 hours') <= now())
    ORDER BY x.last_attempt_at NULLS FIRST, x.enqueued_at, x.id
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN claimed >= p_limit;
    IF itap.file_in_use(q.organization_id, q.file_id) THEN
      DELETE FROM itap.pending_file_deletions x WHERE x.id = q.id;
      CONTINUE;
    END IF;
    UPDATE itap.pending_file_deletions x SET lease_expires_at = now() + interval '10 minutes'
    WHERE x.id = q.id RETURNING * INTO q;
    claimed := claimed + 1;
    RETURN NEXT q;
  END LOOP;
END;
$function$
;
