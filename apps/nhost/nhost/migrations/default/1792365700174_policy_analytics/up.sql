-- Policy analytics (plan-08 task 4; spec §8.1; SA_5 §2.1.4 rule hit rates, denial patterns, complexity metrics,
-- consolidation recommendations). policy_analytics(session, from, to) — STABLE query for org_admin, one row over the
-- access decisions with decided_at in [from, to) (from < to, at most 366 days):
--   decisions / granted / denied   totals of the period;
--   versions        per access policy version that is enforced or decided >= 1 decision in the period (published or
--                   superseded): hits (decisions with policy_version_id = version), granted, denied, last_hit_at,
--                   enforced; ordered by hits desc;
--   unused_versions enforced versions with zero hits in the period;
--   denial_reasons  [{reason, count}] of denied decisions, count desc;
--   top_denied      top 10 (profile_id, access_point_id) pairs by denials (profile_id NULL = unknown person) with
--                   last_denied_at;
--   overlap_hints   pairs of enforced versions whose subject sets and target sets are identical (consolidation
--                   candidates): kind same_effect (merge them) or conflicting (allow vs deny: priority decides);
--   grants          grants whose validity window overlaps the period: total, used (a granted decision in the period
--                   references it), unused (not used, still valid at the end of the period, not revoked), expired
--                   (not used, valid_until <= the end of the period, not revoked), revoked (revoked in the period);
--   complexity      enforced_policies, subjects, targets, schedules (versions with a schedule), max_risk (versions
--                   with max_risk), avg_subjects / avg_targets per enforced version.
CREATE TABLE itap_results.policy_analytics_rows (
  organization_id uuid NOT NULL,
  period_from timestamptz NOT NULL,
  period_to timestamptz NOT NULL,
  decisions integer NOT NULL,
  granted integer NOT NULL,
  denied integer NOT NULL,
  versions jsonb NOT NULL,
  unused_versions jsonb NOT NULL,
  denial_reasons jsonb NOT NULL,
  top_denied jsonb NOT NULL,
  overlap_hints jsonb NOT NULL,
  grants jsonb NOT NULL,
  complexity jsonb NOT NULL
);

CREATE FUNCTION itap.policy_analytics(hasura_session json, p_from timestamptz, p_to timestamptz)
RETURNS SETOF itap_results.policy_analytics_rows
LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org constant uuid := itap.session_organization(hasura_session);
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to - p_from > interval '366 days' THEN
    PERFORM itap.raise_code('report_period_invalid');
  END IF;
  RETURN QUERY
  WITH dec AS (
    SELECT x.result, x.reason, x.policy_version_id, x.grant_id, x.profile_id, x.access_point_id, x.decided_at
    FROM itap.access_decisions x
    WHERE x.organization_id = org AND x.decided_at >= p_from AND x.decided_at < p_to
  ),
  enforced AS (
    SELECT v.id, v.policy_id, v.effect, v.priority, v.schedule, v.max_risk
    FROM itap.access_policies p
    JOIN itap.access_policy_versions v ON v.organization_id = p.organization_id AND v.id = p.current_version_id
    WHERE p.organization_id = org AND NOT p.is_archived AND p.current_version_id IS NOT NULL
  ),
  hits AS (
    SELECT d.policy_version_id AS id, count(*) AS hits, count(*) FILTER (WHERE d.result = 'granted') AS granted,
           count(*) FILTER (WHERE d.result = 'denied') AS denied, max(d.decided_at) AS last_hit_at
    FROM dec d WHERE d.policy_version_id IS NOT NULL GROUP BY d.policy_version_id
  ),
  version_rows AS (
    SELECT v.id, v.policy_id, p.code, p.name, v.version, v.status, v.effect, v.priority,
           coalesce(h.hits, 0) AS hits, coalesce(h.granted, 0) AS granted, coalesce(h.denied, 0) AS denied,
           h.last_hit_at, v.id IN (SELECT e.id FROM enforced e) AS is_enforced
    FROM itap.access_policy_versions v
    JOIN itap.access_policies p ON p.organization_id = v.organization_id AND p.id = v.policy_id
    LEFT JOIN hits h ON h.id = v.id
    WHERE v.organization_id = org AND (h.id IS NOT NULL OR v.id IN (SELECT e.id FROM enforced e))
  ),
  sigs AS (
    SELECT e.id, e.policy_id, e.effect, e.priority,
           (SELECT string_agg(q.k, ',' ORDER BY q.k) FROM (
              SELECT DISTINCT concat_ws('|', 'p:' || s.profile_id, 's:' || s.segment_id, 't:' || s.profile_type,
                                        'l:' || s.access_level) AS k
              FROM itap.access_policy_version_subjects s WHERE s.organization_id = org AND s.version_id = e.id) q) AS subj,
           (SELECT string_agg(q.k, ',' ORDER BY q.k) FROM (
              SELECT DISTINCT concat_ws('|', 'f:' || t.facility_id, 'a:' || t.area_id, 'd:' || t.access_point_id) AS k
              FROM itap.access_policy_version_targets t WHERE t.organization_id = org AND t.version_id = e.id) q) AS targ
    FROM enforced e
  ),
  grant_rows AS (
    SELECT g.id, g.valid_until, g.revoked_at,
           coalesce(g.used_at >= p_from AND g.used_at < p_to, false)
             OR EXISTS (SELECT 1 FROM dec d WHERE d.grant_id = g.id AND d.result = 'granted') AS used
    FROM itap.access_grants g
    WHERE g.organization_id = org AND g.valid_from < p_to AND g.valid_until > p_from
      AND (g.revoked_at IS NULL OR g.revoked_at >= p_from)
  )
  SELECT org, p_from, p_to,
    (SELECT count(*) FROM dec)::integer,
    (SELECT count(*) FROM dec WHERE result = 'granted')::integer,
    (SELECT count(*) FROM dec WHERE result = 'denied')::integer,
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
              'version_id', r.id, 'policy_id', r.policy_id, 'policy_code', r.code, 'policy_name', r.name,
              'version', r.version, 'status', r.status, 'effect', r.effect, 'priority', r.priority,
              'enforced', r.is_enforced, 'hits', r.hits, 'granted', r.granted, 'denied', r.denied,
              'last_hit_at', r.last_hit_at) ORDER BY r.hits DESC, r.code, r.version), '[]')
     FROM version_rows r),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('version_id', r.id, 'policy_id', r.policy_id, 'policy_code', r.code,
                                                  'policy_name', r.name, 'effect', r.effect) ORDER BY r.code), '[]')
     FROM version_rows r WHERE r.is_enforced AND r.hits = 0),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('reason', x.reason, 'count', x.n) ORDER BY x.n DESC, x.reason), '[]')
     FROM (SELECT d.reason, count(*) AS n FROM dec d WHERE d.result = 'denied' GROUP BY d.reason) x),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('profile_id', x.profile_id, 'access_point_id', x.access_point_id,
                                                  'denied', x.n, 'last_denied_at', x.last_at)
                               ORDER BY x.n DESC, x.last_at DESC), '[]')
     FROM (SELECT d.profile_id, d.access_point_id, count(*) AS n, max(d.decided_at) AS last_at
           FROM dec d WHERE d.result = 'denied' AND d.access_point_id IS NOT NULL
           GROUP BY d.profile_id, d.access_point_id
           ORDER BY count(*) DESC, max(d.decided_at) DESC LIMIT 10) x),
    (SELECT coalesce(jsonb_agg(jsonb_build_object(
              'version_a', a.id, 'policy_a', a.policy_id, 'effect_a', a.effect, 'priority_a', a.priority,
              'version_b', b.id, 'policy_b', b.policy_id, 'effect_b', b.effect, 'priority_b', b.priority,
              'kind', CASE WHEN a.effect = b.effect THEN 'same_effect' ELSE 'conflicting' END) ORDER BY a.id, b.id), '[]')
     FROM sigs a JOIN sigs b ON a.id < b.id AND a.subj = b.subj AND a.targ = b.targ),
    (SELECT jsonb_build_object(
              'total', count(*),
              'used', count(*) FILTER (WHERE g.used),
              'unused', count(*) FILTER (WHERE NOT g.used AND g.revoked_at IS NULL AND g.valid_until > p_to),
              'expired', count(*) FILTER (WHERE NOT g.used AND g.revoked_at IS NULL AND g.valid_until <= p_to),
              'revoked', count(*) FILTER (WHERE g.revoked_at IS NOT NULL AND g.revoked_at < p_to))
     FROM grant_rows g),
    (SELECT jsonb_build_object(
              'enforced_policies', count(*),
              'subjects', coalesce(sum(x.ns), 0),
              'targets', coalesce(sum(x.nt), 0),
              'schedules', count(*) FILTER (WHERE x.has_schedule),
              'max_risk', count(*) FILTER (WHERE x.has_max_risk),
              'avg_subjects', coalesce(round(avg(x.ns), 2), 0),
              'avg_targets', coalesce(round(avg(x.nt), 2), 0))
     FROM (SELECT e.id,
                  (SELECT count(*) FROM itap.access_policy_version_subjects s WHERE s.organization_id = org AND s.version_id = e.id) AS ns,
                  (SELECT count(*) FROM itap.access_policy_version_targets t WHERE t.organization_id = org AND t.version_id = e.id) AS nt,
                  e.schedule IS NOT NULL AND jsonb_array_length(e.schedule) > 0 AS has_schedule,
                  e.max_risk IS NOT NULL AS has_max_risk
           FROM enforced e) x);
END;
$$;
