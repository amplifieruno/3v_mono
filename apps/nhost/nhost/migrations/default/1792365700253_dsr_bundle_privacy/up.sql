-- Slice 10 task 3 fix round 1 (review #4, minors): the access / portability bundle holds the person's data only.
-- * No deliveries / inbox: a matching member email does not make a member's private notifications the person's data.
-- * Event payloads lose `people` / `decisions` and every key whose value names another identity or profile
--   (itap.dsr_strip_others).
-- * Files also include the person's detection thumbnails (latest p_limit), face-auth evidence frames and the images
--   of searches whose results name them.

-- Drops the top-level keys whose subtree holds the id of an identity / profile of the organization that is not the
-- person's.
CREATE FUNCTION itap.dsr_strip_others(p jsonb, p_org uuid, p_ids uuid[], p_profile uuid) RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT CASE WHEN p IS NULL OR jsonb_typeof(p) <> 'object' THEN p ELSE coalesce((
    SELECT jsonb_object_agg(x.k, x.v) FROM jsonb_each(p) AS x (k, v)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_path_query(x.v, 'strict $.**') l
      WHERE jsonb_typeof(l) = 'string'
        AND (l #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND NOT ((l #>> '{}')::uuid = ANY (p_ids) OR (l #>> '{}')::uuid = p_profile)
        AND (EXISTS (SELECT 1 FROM itap.identities i WHERE i.organization_id = p_org AND i.id = (l #>> '{}')::uuid)
             OR EXISTS (SELECT 1 FROM itap.profiles pr WHERE pr.organization_id = p_org AND pr.id = (l #>> '{}')::uuid)))),
    '{}'::jsonb) END;
$$;

CREATE OR REPLACE FUNCTION itap.dsr_subject_bundle(p_org uuid, p_profile uuid, p_limit integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
DECLARE
  prof itap.profiles;
  ids uuid[];
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
    ('events', $q$SELECT to_jsonb(e) - 'organization_id' - 'dedup_key' - 'payload'
        || jsonb_build_object('payload', itap.dsr_strip_others(e.payload - 'people' - 'decisions', $1, $2, $3)) AS j
      FROM itap.events e
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
    ('search_results', $q$SELECT to_jsonb(r) - 'organization_id' || jsonb_build_object('searched_at', q.created_at,
        'search_type', q.search_type) AS j
      FROM itap.search_results r JOIN itap.search_requests q ON q.organization_id = r.organization_id AND q.id = r.search_request_id
      WHERE r.organization_id = $1 AND (r.identity_id = ANY ($2) OR r.profile_id = $3) ORDER BY q.created_at DESC$q$),
    ('audit', $q$SELECT to_jsonb(a) - 'organization_id' - 'ip' - 'user_agent' AS j FROM itap.audit_log a
      WHERE a.organization_id = $1 AND ((a.entity = 'profiles' AND a.entity_id = $3) OR (a.entity = 'identities' AND a.entity_id = ANY ($2)))
      ORDER BY a.occurred_at DESC$q$)
  ) AS t (name, query)
  LOOP
    SELECT * INTO part FROM itap.dsr_bundle_section(sec.query, p_org, ids, p_profile, NULL, p_limit);
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
      UNION ALL SELECT 'thumbnail', t.thumbnail_file_id, 5 FROM (
        SELECT d.thumbnail_file_id FROM itap.detections d
        WHERE d.organization_id = p_org AND d.identity_id = ANY (ids) AND d.thumbnail_file_id IS NOT NULL
        ORDER BY d.detected_at DESC LIMIT p_limit) t
      UNION ALL SELECT 'auth_evidence', a.evidence_file_id, 6 FROM itap.authentication_attempts a
        WHERE a.organization_id = p_org AND a.evidence_file_id IS NOT NULL
          AND (a.matched_identity_id = ANY (ids) OR a.claimed_identity_id = ANY (ids) OR a.profile_id = p_profile)
      UNION ALL SELECT 'search_image', q.image_file_id, 7 FROM itap.search_requests q
        WHERE q.organization_id = p_org AND q.image_file_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM itap.search_results sr WHERE sr.organization_id = q.organization_id AND sr.search_request_id = q.id
            AND (sr.identity_id = ANY (ids) OR sr.profile_id = p_profile))
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
$function$;
