-- Slice 8 task 1 follow-up: credential-withdrawal bumps only when an enforced policy can depend on the change.
-- Enforced version = access_policies.current_version_id (not archived). Unconditional: profile status -> non-active,
-- profile delete, blacklist entry added. Conditional:
--   segment_members closed / deleted: the segment is a subject of an enforced version;
--   profile_type changed: some enforced version has a profile_type subject;
--   access_level lowered: some enforced version has an access_level subject.
-- (A profile change that matches several cases bumps when any applies.)
CREATE FUNCTION itap.enforced_subject_exists(p_org uuid, p_kind text, p_segment uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT EXISTS (
    SELECT 1 FROM itap.access_policies p
    JOIN itap.access_policy_version_subjects s ON s.organization_id = p.organization_id AND s.version_id = p.current_version_id
    WHERE p.organization_id = p_org AND NOT p.is_archived
      AND CASE p_kind
        WHEN 'segment' THEN s.segment_id = p_segment
        WHEN 'profile_type' THEN s.profile_type IS NOT NULL
        WHEN 'access_level' THEN s.access_level IS NOT NULL
        ELSE false
      END
  );
$$;

CREATE OR REPLACE FUNCTION itap.access_credentials_withdrawn() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  org uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  flag text := 'itap.policy_withdrawn_' || replace(org::text, '-', '');
  o jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  n jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
BEGIN
  IF coalesce(current_setting(flag, true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  -- Organization cascade: nothing to distribute.
  IF NOT EXISTS (SELECT 1 FROM itap.organizations x WHERE x.id = org) THEN
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME = 'watch_list_entries' THEN
    IF NOT EXISTS (
      SELECT 1 FROM itap.watch_lists l
      WHERE l.organization_id = org AND l.id = (n ->> 'watch_list_id')::uuid AND l.kind = 'blacklist'
    ) THEN
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'segment_members' THEN
    IF NOT itap.enforced_subject_exists(org, 'segment', (o ->> 'segment_id')::uuid) THEN
      RETURN NULL;
    END IF;
  ELSIF TG_TABLE_NAME = 'profiles' AND TG_OP = 'UPDATE' THEN
    IF NOT (
      (o ->> 'status' IS DISTINCT FROM n ->> 'status' AND n ->> 'status' <> 'active')
      OR (o ->> 'profile_type' IS DISTINCT FROM n ->> 'profile_type' AND itap.enforced_subject_exists(org, 'profile_type'))
      OR (coalesce(itap.access_rank(n ->> 'access_level'), 0) < coalesce(itap.access_rank(o ->> 'access_level'), 0)
          AND itap.enforced_subject_exists(org, 'access_level'))
    ) THEN
      RETURN NULL;
    END IF;
  END IF;
  PERFORM itap.bump_policy_epoch(org, true);
  PERFORM set_config(flag, 'on', true);
  RETURN NULL;
END;
$$;
