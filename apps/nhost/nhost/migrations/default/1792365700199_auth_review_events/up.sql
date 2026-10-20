-- Slice 9 task 2: a manual review decides the authentication. Approval of a pending partial match emits auth_success
-- (ledger ruling), rejection emits auth_failed (same dedup key auth:<attempt id>; the partial match itself emitted no
-- event). Otherwise unchanged from 1792365700195_auth_review_and_session_guards.
CREATE OR REPLACE FUNCTION itap.review_authentication_attempt(hasura_session json, p_attempt uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS SETOF itap.authentication_attempts
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := itap.session_organization(hasura_session);
  actor uuid := itap.require_active_member(hasura_session);
  current_status text;
  session uuid;
  matched uuid;
  att itap.authentication_attempts;
  app_name text;
  ap itap.access_points;
  ev itap.events;
  event_id uuid;
  note text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  IF p_approve IS NULL THEN
    PERFORM itap.raise_code('auth_review_decision_required');
  END IF;
  SELECT review_status, session_id, matched_identity_id INTO current_status, session, matched
  FROM itap.authentication_attempts
  WHERE organization_id = org AND id = p_attempt FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('auth_attempt_not_found');
  END IF;
  IF current_status <> 'pending' THEN
    PERFORM itap.raise_code('auth_attempt_not_pending');
  END IF;
  IF matched IS NULL THEN
    PERFORM itap.raise_code('auth_attempt_no_match');
  END IF;
  PERFORM set_config('itap.auth_review_context', 'on', true);
  UPDATE itap.authentication_attempts
  SET review_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_by = actor, reviewed_at = now(), review_note = note
  WHERE organization_id = org AND id = p_attempt;
  PERFORM set_config('itap.auth_review_context', 'off', true);
  IF session IS NOT NULL THEN
    UPDATE itap.authentication_sessions
    SET status = CASE WHEN p_approve THEN 'succeeded' ELSE 'failed' END, closed_at = now()
    WHERE organization_id = org AND id = session AND status IN ('open', 'review');
  END IF;
  -- The review decides the authentication: approval emits auth_success, rejection auth_failed (dedup auth:<attempt>;
  -- a partial match emitted no event before), with Stage C.
  SELECT * INTO att FROM itap.authentication_attempts WHERE organization_id = org AND id = p_attempt;
  SELECT a.name INTO app_name FROM itap.client_applications a WHERE a.organization_id = org AND a.id = att.application_id;
  IF att.access_point_id IS NOT NULL THEN
    SELECT * INTO ap FROM itap.access_points x WHERE x.organization_id = org AND x.id = att.access_point_id;
  END IF;
  ev.organization_id := org;
  ev.facility_id := ap.facility_id;
  ev.area_id := ap.area_id;
  ev.access_point_id := ap.id;
  ev.identity_id := CASE WHEN p_approve THEN att.matched_identity_id END;
  ev.profile_id := CASE WHEN p_approve THEN att.profile_id END;
  ev.authentication_attempt_id := att.id;
  ev.event_type := CASE WHEN p_approve THEN 'auth_success' ELSE 'auth_failed' END;
  ev.severity := CASE WHEN p_approve THEN 'info' ELSE 'low' END;
  ev.title := CASE WHEN p_approve THEN 'Authentication approved on review: ' ELSE 'Authentication rejected on review: ' END
              || coalesce(app_name, '');
  ev.payload := jsonb_build_object('application_id', att.application_id, 'mode', att.mode, 'session_id', att.session_id,
                                   'review_status', att.review_status, 'reviewed_by', actor, 'confidence', att.confidence,
                                   'threshold', att.threshold_used, 'matched_identity_id', att.matched_identity_id);
  ev.dedup_key := 'auth:' || att.id;
  ev.occurred_at := now();
  event_id := itap.emit_event(ev);
  IF event_id IS NOT NULL THEN
    PERFORM itap.finish_events(org, ARRAY[event_id]);
  END IF;
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes, reason)
  VALUES (org, actor, CASE WHEN p_approve THEN 'approve' ELSE 'reject' END, 'authentication_attempts', p_attempt,
          jsonb_build_object('review_status', jsonb_build_array('pending', CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END),
                             'session_id', session),
          note);
  RETURN QUERY SELECT * FROM itap.authentication_attempts WHERE organization_id = org AND id = p_attempt;
END;
$$;
