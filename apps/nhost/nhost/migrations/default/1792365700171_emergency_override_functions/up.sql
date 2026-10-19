-- Emergency overrides (plan-08 task 4; spec §6.13, §8.1, §8.3; SA_5 §2.1.4: authorized emergency access, mandatory
-- justification, supervisor notification, automatic restoration, audit trail).
--   start_emergency_override(session, facility, mode, justification, ends_at, area_ids[]) — org_admin, active member;
--       justification >= 10 characters, now() < ends_at <= now() + 24 h, areas of the facility (none = whole facility).
--   end_emergency_override(session, override, reason) — org_admin, active member; reason required; ended_at = now()
--       (or ends_at when the override already ran out and the cron has not closed it yet).
--   end_emergency_overrides(org, at) — cron (admin-only): overrides with ends_at <= least(at, now()) still open are
--       ended at their ends_at with ended_by NULL and end_reason 'expired'. Idempotent (open rows only, row lock).
-- Each start / end emits emergency_override_started (high) / emergency_override_ended (medium) through emit_event
-- (dedup keys override:<id>:started / override:<id>:ended) and finish_events, so Stage C notifies supervisors through
-- notification rules on those types. Audit: the table's audit trigger records the insert (with justification) and
-- the end (ended_at / ended_by / end_reason) as the caller (NULL user for the cron).
-- Overlapping active overrides are allowed (same facility, overlapping area sets); evaluate_access picks one per
-- access point by its documented order (evacuation at an exit, then lock_all, unlock_all; latest start; id).
-- Epoch: the policy_epoch_on_change trigger bumps on insert (every start urgent) and on end (unlock_all /
-- evacuation urgent, lock_all lazy). Terminals also receive ends_at in their payload and stop applying an override
-- at ends_at on their own (like grant valid_until), before the cron closes it.
-- Lock order: start = event keys -> Stage C -> override insert -> organization_settings (epoch trigger, last);
-- end = override row (FOR UPDATE) -> event keys -> Stage C -> organization_settings.

ALTER TABLE itap.emergency_overrides
  ADD COLUMN end_reason text,
  ADD CONSTRAINT emergency_overrides_end_reason_needs_end CHECK (end_reason IS NULL OR ended_at IS NOT NULL);

-- Same guard as 1792365700154, plus end_reason among the columns an end may set (once).
CREATE OR REPLACE FUNCTION itap.guard_emergency_override() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_context boolean := coalesce(current_setting('itap.override_context', true), '') = 'on';
  org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  ending text[] := ARRAY['ended_at', 'ended_by', 'end_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = org) THEN
    RETURN OLD;
  END IF;
  IF NOT in_context OR TG_OP = 'DELETE' THEN
    PERFORM itap.raise_code('emergency_override_function_only');
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME <> 'emergency_overrides' THEN
      PERFORM itap.raise_code('emergency_override_not_editable');
    END IF;
    IF (to_jsonb(NEW) - ending) IS DISTINCT FROM (to_jsonb(OLD) - ending) OR to_jsonb(OLD) ->> 'ended_at' IS NOT NULL THEN
      PERFORM itap.raise_code('emergency_override_not_editable');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Emits the started / ended event of an override (Stage C included). p_kind: 'started' | 'ended'.
CREATE FUNCTION itap.emit_override_event(
  p_override itap.emergency_overrides, p_kind text, p_at timestamptz, p_area_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ev itap.events;
  event_id uuid;
  fac_name text;
BEGIN
  SELECT f.name INTO fac_name FROM itap.facilities f
  WHERE f.organization_id = p_override.organization_id AND f.id = p_override.facility_id;
  ev.organization_id := p_override.organization_id;
  ev.facility_id := p_override.facility_id;
  ev.event_type := 'emergency_override_' || p_kind;
  ev.severity := CASE p_kind WHEN 'started' THEN 'high' ELSE 'medium' END;
  ev.title := 'Emergency override ' || replace(p_override.mode, '_', ' ') || ' ' || p_kind || ': ' || coalesce(fac_name, '');
  ev.payload := jsonb_build_object(
    'override_id', p_override.id, 'mode', p_override.mode, 'justification', p_override.justification,
    'started_by', p_override.started_by, 'started_at', p_override.started_at, 'ends_at', p_override.ends_at,
    'ended_by', p_override.ended_by, 'ended_at', p_override.ended_at, 'end_reason', p_override.end_reason,
    'area_ids', to_jsonb(coalesce(p_area_ids, '{}')));
  ev.dedup_key := 'override:' || p_override.id || ':' || p_kind;
  ev.occurred_at := p_at;
  event_id := itap.emit_event(ev);
  IF event_id IS NOT NULL THEN
    PERFORM itap.finish_events(p_override.organization_id, ARRAY[event_id]);
  END IF;
  RETURN event_id;
END;
$$;
REVOKE ALL ON FUNCTION itap.emit_override_event(itap.emergency_overrides, text, timestamptz, uuid[]) FROM PUBLIC;

-- Active, unexpired member of the session organization, else member_required.
CREATE FUNCTION itap.require_active_member(hasura_session json) RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid;
BEGIN
  SELECT m.user_id INTO actor FROM itap.organization_members m
  WHERE m.organization_id = org AND m.user_id = itap.session_user_id(hasura_session)
    AND m.status = 'active' AND (m.expires_at IS NULL OR m.expires_at > now());
  IF actor IS NULL THEN
    PERFORM itap.raise_code('member_required');
  END IF;
  RETURN actor;
END;
$$;

CREATE FUNCTION itap.start_emergency_override(
  hasura_session json,
  p_facility uuid,
  p_mode text,
  p_justification text,
  p_ends_at timestamptz,
  p_area_ids uuid[] DEFAULT NULL
) RETURNS SETOF itap.emergency_overrides
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  areas uuid[] := ARRAY(SELECT DISTINCT a FROM unnest(coalesce(p_area_ids, '{}')) a WHERE a IS NOT NULL ORDER BY a);
  ov itap.emergency_overrides;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM itap.facilities f WHERE f.organization_id = org AND f.id = p_facility) THEN
    PERFORM itap.raise_code('facility_not_found');
  END IF;
  IF p_mode IS NULL OR NOT EXISTS (SELECT 1 FROM itap.override_modes m WHERE m.value = p_mode) THEN
    PERFORM itap.raise_code('override_mode_invalid');
  END IF;
  IF char_length(btrim(coalesce(p_justification, ''))) < 10 THEN
    PERFORM itap.raise_code('justification_required');
  END IF;
  IF p_ends_at IS NULL OR p_ends_at <= now() OR p_ends_at > now() + interval '24 hours' THEN
    PERFORM itap.raise_code('override_ends_at_invalid');
  END IF;
  IF cardinality(areas) > 0 AND (
    SELECT count(*) FROM itap.areas a WHERE a.organization_id = org AND a.facility_id = p_facility AND a.id = ANY (areas)
  ) <> cardinality(areas) THEN
    PERFORM itap.raise_code('area_not_found');
  END IF;

  ov.id := gen_random_uuid();
  ov.organization_id := org;
  ov.facility_id := p_facility;
  ov.mode := p_mode;
  ov.justification := btrim(p_justification);
  ov.started_by := actor;
  ov.started_at := now();
  ov.ends_at := p_ends_at;
  -- The event first (lock order: event keys and Stage C before the insert, whose trigger bumps the epoch).
  PERFORM itap.emit_override_event(ov, 'started', ov.started_at, areas);
  PERFORM set_config('itap.override_context', 'on', true);
  INSERT INTO itap.emergency_overrides (id, organization_id, facility_id, mode, justification, started_by, started_at, ends_at)
  VALUES (ov.id, org, p_facility, p_mode, ov.justification, actor, ov.started_at, p_ends_at);
  INSERT INTO itap.emergency_override_areas (organization_id, facility_id, override_id, area_id)
  SELECT org, p_facility, ov.id, a FROM unnest(areas) a;
  PERFORM set_config('itap.override_context', 'off', true);
  RETURN QUERY SELECT * FROM itap.emergency_overrides e WHERE e.organization_id = org AND e.id = ov.id;
END;
$$;

-- Ends one open override (lock first); returns the ended row. Shared by end_emergency_override and the cron.
CREATE FUNCTION itap.close_emergency_override(p_org uuid, p_override uuid, p_by uuid, p_at timestamptz, p_reason text)
RETURNS itap.emergency_overrides
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  ov itap.emergency_overrides;
BEGIN
  SELECT * INTO ov FROM itap.emergency_overrides e WHERE e.organization_id = p_org AND e.id = p_override FOR UPDATE;
  IF NOT FOUND OR ov.ended_at IS NOT NULL THEN
    RETURN NULL;
  END IF;
  ov.ended_at := greatest(least(p_at, ov.ends_at), ov.started_at);
  ov.ended_by := p_by;
  ov.end_reason := p_reason;
  -- The event before the update (whose trigger bumps the epoch): override row -> event keys -> Stage C -> settings.
  PERFORM itap.emit_override_event(ov, 'ended', ov.ended_at, ARRAY(
    SELECT x.area_id FROM itap.emergency_override_areas x
    WHERE x.organization_id = p_org AND x.override_id = p_override ORDER BY x.area_id));
  PERFORM set_config('itap.override_context', 'on', true);
  UPDATE itap.emergency_overrides e SET ended_at = ov.ended_at, ended_by = p_by, end_reason = p_reason
  WHERE e.organization_id = p_org AND e.id = p_override
  RETURNING * INTO ov;
  PERFORM set_config('itap.override_context', 'off', true);
  RETURN ov;
END;
$$;
REVOKE ALL ON FUNCTION itap.close_emergency_override(uuid, uuid, uuid, timestamptz, text) FROM PUBLIC;

CREATE FUNCTION itap.end_emergency_override(hasura_session json, p_override uuid, p_reason text)
RETURNS SETOF itap.emergency_overrides
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  ended timestamptz;
  ov itap.emergency_overrides;
BEGIN
  SELECT e.ended_at INTO ended FROM itap.emergency_overrides e WHERE e.organization_id = org AND e.id = p_override;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('emergency_override_not_found');
  END IF;
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    PERFORM itap.raise_code('end_reason_required');
  END IF;
  ov := itap.close_emergency_override(org, p_override, actor, now(), btrim(p_reason));
  IF ov.id IS NULL THEN
    PERFORM itap.raise_code('emergency_override_ended');
  END IF;
  RETURN QUERY SELECT * FROM itap.emergency_overrides e WHERE e.organization_id = org AND e.id = p_override;
END;
$$;

-- Cron end_emergency_overrides (admin-only, per organization at the run's scheduled time): open overrides that ran
-- out by least(p_at, now()) are ended at their ends_at (ended_by NULL, end_reason 'expired'); returns them.
CREATE FUNCTION itap.end_emergency_overrides(p_organization uuid, p_at timestamptz)
RETURNS SETOF itap.emergency_overrides
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  cutoff timestamptz := least(coalesce(p_at, now()), now());
  r record;
  ov itap.emergency_overrides;
BEGIN
  FOR r IN
    SELECT e.id FROM itap.emergency_overrides e
    WHERE e.organization_id = p_organization AND e.ended_at IS NULL AND e.ends_at <= cutoff
    ORDER BY e.ends_at, e.id
  LOOP
    ov := itap.close_emergency_override(p_organization, r.id, NULL, cutoff, 'expired');
    IF ov.id IS NOT NULL THEN
      RETURN NEXT ov;
    END IF;
  END LOOP;
END;
$$;
