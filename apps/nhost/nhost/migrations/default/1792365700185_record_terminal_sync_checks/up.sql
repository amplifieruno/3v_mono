-- Slice 8 final review: record_terminal_sync rejects a synced result without a checksum or with an epoch above the
-- organization's current policy_epoch (a terminal can never be recorded ahead of the policy state).
CREATE OR REPLACE FUNCTION itap.record_terminal_sync(p_device uuid, p_epoch bigint, p_urgent boolean, p_forced boolean, p_result text, p_checksum text, p_size_bytes integer, p_duration_ms numeric, p_error text DEFAULT NULL::text)
 RETURNS SETOF itap.terminal_policy_syncs
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  d itap.devices;
  row_id uuid := gen_random_uuid();
  err text := CASE WHEN p_result <> 'synced' THEN coalesce(nullif(btrim(coalesce(p_error, '')), ''), p_result) END;
BEGIN
  SELECT * INTO d FROM itap.devices x WHERE x.id = p_device FOR UPDATE;
  IF NOT FOUND OR d.device_type <> 'access_terminal' THEN
    PERFORM itap.raise_code('terminal_not_found');
  END IF;
  IF p_result = 'synced' THEN
    -- A synced terminal holds a concrete payload of an epoch the organization has reached.
    IF p_checksum IS NULL THEN
      PERFORM itap.raise_code('terminal_sync_checksum_required');
    END IF;
    IF p_epoch IS NULL OR p_epoch > coalesce(
      (SELECT st.policy_epoch FROM itap.organization_settings st WHERE st.organization_id = d.organization_id), 0
    ) THEN
      PERFORM itap.raise_code('terminal_sync_epoch_invalid');
    END IF;
    UPDATE itap.devices x
    SET policy_version_synced = greatest(coalesce(x.policy_version_synced, -1), p_epoch), policy_synced_at = now(),
        policy_sync_error = NULL
    WHERE x.organization_id = d.organization_id AND x.id = p_device;
  ELSIF d.policy_sync_error IS NOT DISTINCT FROM err THEN
    -- Same failure as last time: no state change, nothing logged.
    RETURN;
  ELSE
    UPDATE itap.devices x SET policy_sync_error = err WHERE x.organization_id = d.organization_id AND x.id = p_device;
  END IF;
  INSERT INTO itap.terminal_policy_syncs (id, organization_id, facility_id, device_id, epoch, urgent, forced, result,
                                          checksum, size_bytes, duration_ms, error)
  VALUES (row_id, d.organization_id, d.facility_id, p_device, p_epoch, coalesce(p_urgent, false), coalesce(p_forced, false),
          p_result, p_checksum, p_size_bytes, p_duration_ms, err);
  RETURN QUERY SELECT * FROM itap.terminal_policy_syncs x WHERE x.organization_id = d.organization_id AND x.id = row_id;
END;
$function$;
