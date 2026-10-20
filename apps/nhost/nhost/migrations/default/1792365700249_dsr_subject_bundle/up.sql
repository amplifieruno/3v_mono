-- Slice 10 task 3: access / portability bundle (GDPR Art. 15 / 20).
-- itap.dsr_subject_bundle(org, profile, limit): jsonb grouped by entity about the person = the profile and every
-- identity of its graph (itap.legal_hold_subjects: linked identities and merge sources / targets). Entities with a
-- time dimension hold the latest p_limit rows (default 10000); a cut entity is listed in `truncated` with a note.
-- Deliveries / inbox only when the person is a member of the organization (profile email = member email). No face
-- templates (vectors), no other people's network data (audit ip / user agent). `files`: photos, documents, avatar,
-- consent documents with their path inside the zip (files/<category>s/<file id><ext>).
-- itap.dsr_bundle(request, attempt) (backend, fenced): the bundle with the request header and the schema id
-- (itap-dsr-access/1, itap-dsr-portability/1; schema_version 1). itap.complete_dsr_export(request, attempt, file,
-- summary): attaches the uploaded zip (kind dsr_export), completes, audit `export`.

-- One entity section: the query (params $1 org, $2 identity ids, $3 profile, $4 member user, $5 limit) yields
-- column j in the wanted order; at most p_limit rows, truncated when there were more.
CREATE FUNCTION itap.dsr_bundle_section(p_query text, p_org uuid, p_ids uuid[], p_profile uuid, p_user uuid,
  p_limit integer, OUT rows jsonb, OUT truncated boolean)
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
BEGIN
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(q.j ORDER BY q.n) FILTER (WHERE q.n <= $5), ''[]''::jsonb), count(*) > $5
     FROM (SELECT row_number() OVER () AS n, s.j FROM (%s LIMIT $5 + 1) s) q', p_query)
  INTO rows, truncated USING p_org, p_ids, p_profile, p_user, p_limit;
END;
$$;

CREATE FUNCTION itap.dsr_subject_bundle(p_org uuid, p_profile uuid, p_limit integer DEFAULT 10000) RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  prof itap.profiles;
  ids uuid[];
  member uuid;
  sections jsonb := '{}'::jsonb;
  cut jsonb := '{}'::jsonb;
  notes jsonb := '[]'::jsonb;
  sec record;
  part record;
  files jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN
    PERFORM itap.raise_code('dsr_bundle_limit_invalid');
  END IF;
  SELECT * INTO prof FROM itap.profiles p WHERE p.organization_id = p_org AND p.id = p_profile;
  IF NOT FOUND THEN
    PERFORM itap.raise_code('profile_not_found');
  END IF;
  ids := ARRAY(SELECT x.id FROM itap.legal_hold_subjects(p_org, '{}'::uuid[], ARRAY[p_profile]) x
               WHERE x.kind = 'identity' ORDER BY x.id);
  SELECT m.user_id INTO member FROM itap.organization_members m JOIN auth.users u ON u.id = m.user_id
  WHERE m.organization_id = p_org AND prof.email IS NOT NULL AND lower(u.email) = lower(prof.email)
  ORDER BY m.user_id LIMIT 1;

  FOR sec IN SELECT * FROM (VALUES
    ('identities', $q$SELECT to_jsonb(i) - 'organization_id' || jsonb_build_object(
        'template_count', (SELECT count(*) FROM itap.identity_embeddings e WHERE e.organization_id = $1 AND e.identity_id = i.id)) AS j
      FROM itap.identities i WHERE i.organization_id = $1 AND i.id = ANY ($2) ORDER BY i.created_at$q$),
    ('photos', $q$SELECT to_jsonb(p) - 'organization_id' AS j FROM itap.identity_photos p
      WHERE p.organization_id = $1 AND p.identity_id = ANY ($2) ORDER BY p.created_at DESC$q$),
    ('documents', $q$SELECT to_jsonb(d) - 'organization_id' AS j FROM itap.profile_documents d
      WHERE d.organization_id = $1 AND d.profile_id = $3 ORDER BY d.created_at DESC$q$),
    ('consents', $q$SELECT to_jsonb(c) - 'organization_id' AS j FROM itap.consent_records c
      WHERE c.organization_id = $1 AND c.profile_id = $3 ORDER BY c.granted_at DESC$q$),
    ('visits', $q$SELECT to_jsonb(v) - 'organization_id' || jsonb_build_object(
        'role', CASE WHEN v.visitor_profile_id = $3 THEN 'visitor' ELSE 'host' END) AS j
      FROM itap.visits v WHERE v.organization_id = $1 AND (v.visitor_profile_id = $3 OR v.host_profile_id = $3)
      ORDER BY v.expected_start DESC$q$),
    ('detections', $q$SELECT to_jsonb(d) - 'organization_id' AS j FROM itap.detections d
      WHERE d.organization_id = $1 AND d.identity_id = ANY ($2) ORDER BY d.detected_at DESC$q$),
    ('sessions', $q$SELECT to_jsonb(t) - 'organization_id' AS j FROM itap.tracking_sessions t
      WHERE t.organization_id = $1 AND (t.identity_id = ANY ($2) OR t.profile_id = $3) ORDER BY t.started_at DESC$q$),
    ('locations', $q$SELECT to_jsonb(l) - 'organization_id' AS j FROM itap.identity_locations l
      WHERE l.organization_id = $1 AND l.identity_id = ANY ($2) ORDER BY l.occurred_at DESC$q$),
    ('events', $q$SELECT to_jsonb(e) - 'organization_id' - 'dedup_key' AS j FROM itap.events e
      WHERE e.organization_id = $1 AND (e.identity_id = ANY ($2) OR e.profile_id = $3
        OR e.payload ->> 'matched_identity_id' = ANY ($2::text[]) OR e.payload ->> 'claimed_identity_id' = ANY ($2::text[]))
      ORDER BY e.occurred_at DESC$q$),
    ('incidents', $q$SELECT jsonb_build_object('id', i.id, 'code', i.code, 'title', i.title, 'severity', i.severity,
        'status', i.status, 'created_at', i.created_at, 'resolved_at', i.resolved_at, 'role', ii.role) AS j
      FROM itap.incident_identities ii JOIN itap.incidents i ON i.organization_id = ii.organization_id AND i.id = ii.incident_id
      WHERE ii.organization_id = $1 AND ii.identity_id = ANY ($2) ORDER BY i.created_at DESC$q$),
    ('access_decisions', $q$SELECT to_jsonb(d) - 'organization_id' AS j FROM itap.access_decisions d
      WHERE d.organization_id = $1 AND (d.identity_id = ANY ($2) OR d.profile_id = $3) ORDER BY d.decided_at DESC$q$),
    ('access_grants', $q$SELECT to_jsonb(g) - 'organization_id' AS j FROM itap.access_grants g
      WHERE g.organization_id = $1 AND g.profile_id = $3 ORDER BY g.valid_from DESC$q$),
    ('auth_attempts', $q$SELECT to_jsonb(a) - 'organization_id' - 'sequence_digest' AS j FROM itap.authentication_attempts a
      WHERE a.organization_id = $1 AND (a.matched_identity_id = ANY ($2) OR a.claimed_identity_id = ANY ($2) OR a.profile_id = $3)
      ORDER BY a.attempted_at DESC$q$),
    ('segment_memberships', $q$SELECT to_jsonb(m) - 'organization_id' || jsonb_build_object('segment_name', s.name) AS j
      FROM itap.segment_members m JOIN itap.segments s ON s.organization_id = m.organization_id AND s.id = m.segment_id
      WHERE m.organization_id = $1 AND (m.identity_id = ANY ($2) OR m.profile_id = $3) ORDER BY m.added_at DESC$q$),
    ('watch_list_entries', $q$SELECT to_jsonb(x) - 'organization_id' || jsonb_build_object('watch_list', w.name, 'kind', w.kind) AS j
      FROM itap.watch_list_entries x JOIN itap.watch_lists w ON w.organization_id = x.organization_id AND w.id = x.watch_list_id
      WHERE x.organization_id = $1 AND (x.identity_id = ANY ($2) OR x.profile_id = $3) ORDER BY x.created_at DESC$q$),
    ('deliveries', $q$SELECT to_jsonb(d) - 'organization_id' - 'recipient_key' AS j FROM itap.notification_deliveries d
      WHERE d.organization_id = $1 AND $4 IS NOT NULL AND d.recipient_user_id = $4 ORDER BY d.created_at DESC$q$),
    ('inbox', $q$SELECT to_jsonb(u) - 'organization_id' AS j FROM itap.user_notifications u
      WHERE u.organization_id = $1 AND $4 IS NOT NULL AND u.user_id = $4 ORDER BY u.created_at DESC$q$),
    ('search_results', $q$SELECT to_jsonb(r) - 'organization_id' || jsonb_build_object('searched_at', q.created_at,
        'search_type', q.search_type) AS j
      FROM itap.search_results r JOIN itap.search_requests q ON q.organization_id = r.organization_id AND q.id = r.search_request_id
      WHERE r.organization_id = $1 AND (r.identity_id = ANY ($2) OR r.profile_id = $3) ORDER BY q.created_at DESC$q$),
    ('audit', $q$SELECT to_jsonb(a) - 'organization_id' - 'ip' - 'user_agent' AS j FROM itap.audit_log a
      WHERE a.organization_id = $1 AND ((a.entity = 'profiles' AND a.entity_id = $3) OR (a.entity = 'identities' AND a.entity_id = ANY ($2)))
      ORDER BY a.occurred_at DESC$q$)
  ) AS t (name, query)
  LOOP
    SELECT * INTO part FROM itap.dsr_bundle_section(sec.query, p_org, ids, p_profile, member, p_limit);
    sections := sections || jsonb_build_object(sec.name, part.rows);
    IF part.truncated THEN
      cut := cut || jsonb_build_object(sec.name, true);
      notes := notes || to_jsonb(format('%s: only the latest %s rows are included', sec.name, p_limit));
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'file_id', f.id, 'category', c.category,
           'path', 'files/' || c.category || 's/' || f.id || coalesce(substring(f.name FROM '(\.[A-Za-z0-9]{1,8})$'), ''),
           'name', f.name, 'mime_type', f.mime_type, 'size', f.size) ORDER BY c.category, f.id), '[]'::jsonb)
  INTO files
  FROM (
    SELECT DISTINCT ON (x.file_id) x.category, x.file_id FROM (
      SELECT 'photo' AS category, p.file_id, 1 AS rank FROM itap.identity_photos p WHERE p.organization_id = p_org AND p.identity_id = ANY (ids)
      UNION ALL SELECT 'photo', i.primary_photo_file_id, 1 FROM itap.identities i
        WHERE i.organization_id = p_org AND i.id = ANY (ids) AND i.primary_photo_file_id IS NOT NULL
      UNION ALL SELECT 'photo', e.photo_file_id, 1 FROM itap.identity_embeddings e
        WHERE e.organization_id = p_org AND e.identity_id = ANY (ids) AND e.photo_file_id IS NOT NULL
      UNION ALL SELECT 'avatar', prof.avatar_file_id, 2 WHERE prof.avatar_file_id IS NOT NULL
      UNION ALL SELECT 'document', d.file_id, 3 FROM itap.profile_documents d WHERE d.organization_id = p_org AND d.profile_id = p_profile
      UNION ALL SELECT 'consent_document', c.document_file_id, 4 FROM itap.consent_records c
        WHERE c.organization_id = p_org AND c.profile_id = p_profile AND c.document_file_id IS NOT NULL
    ) x ORDER BY x.file_id, x.rank
  ) c
  JOIN storage.files f ON f.id = c.file_id;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'organization_id', p_org,
    'subject', jsonb_build_object('profile_id', p_profile, 'identity_ids', to_jsonb(ids)),
    'limits', jsonb_build_object('rows_per_entity', p_limit),
    'entities', jsonb_build_object('profile', to_jsonb(prof) - 'organization_id') || sections,
    'files', files,
    'truncated', cut,
    'notes', notes);
END;
$$;

CREATE FUNCTION itap.dsr_bundle(p_request uuid, p_attempt integer) RETURNS SETOF itap_results.dsr_bundles
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['access', 'portability']);
BEGIN
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT r.organization_id, r.id,
    jsonb_build_object(
      'schema', CASE r.request_type WHEN 'portability' THEN 'itap-dsr-portability/1' ELSE 'itap-dsr-access/1' END,
      'schema_version', 1,
      'request', jsonb_build_object('id', r.id, 'code', r.code, 'request_type', r.request_type,
        'received_at', r.received_at, 'due_at', r.due_at))
    || itap.dsr_subject_bundle(r.organization_id, r.profile_id);
END;
$$;

CREATE FUNCTION itap.complete_dsr_export(p_request uuid, p_attempt integer, p_file uuid, p_summary jsonb)
RETURNS SETOF itap.data_subject_requests
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  r itap.data_subject_requests := itap.dsr_fenced(p_request, p_attempt, ARRAY['access', 'portability']);
BEGIN
  IF r.id IS NULL THEN
    RETURN;
  END IF;
  UPDATE itap.data_subject_requests
  SET export_file_id = p_file, status = 'completed', completed_at = now(), lease_expires_at = NULL
  WHERE id = r.id RETURNING * INTO r;
  PERFORM itap.dsr_step(r, 'export_uploaded', jsonb_build_object('file_id', p_file) || coalesce(p_summary, '{}'::jsonb));
  PERFORM itap.dsr_step(r, 'completed');
  INSERT INTO itap.audit_log (organization_id, user_id, action, entity, entity_id, changes)
  VALUES (r.organization_id, r.requested_by, 'export', 'profiles', r.profile_id,
          jsonb_build_object('request_id', r.id, 'code', r.code, 'request_type', r.request_type, 'file_id', p_file));
  RETURN NEXT r;
END;
$$;
