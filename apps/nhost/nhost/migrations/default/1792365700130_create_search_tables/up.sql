-- Face / attribute search (spec §6.11, slice 7 task 3).
--   search_requests: one row per search, owned by the member who ran it (user_id; owner-only in metadata, like the
--     inbox). Written by the backend (action search_faces, cron run_saved_searches): queued -> running ->
--     completed | failed (queued -> failed too). The definition (type, filters, image, threshold, limits) is fixed
--     once inserted; the image link may only go NULL (file deleted). History: no delete for org_admin.
--   search_results: ranked rows of a request (read-only); written only while the request is running (or under
--     itap.seed_context). identity / profile links go NULL when those rows are deleted (log rows, spec §6.0).
--   saved_searches: owner-managed definitions; is_shared ones are readable (not editable) by the organization.
--     schedule_cron (5-field subset, itap.valid_cron, organization timezone) drives the hourly run_saved_searches
--     cron; last_run_at / next_run_at / last_run_status / last_error / last_search_request_id are system columns.
-- Filters (itap.valid_search_filters, shared by requests and saved searches): an object with any of
--   status: [identity status...], linked: boolean, profile_type: [profile type...], company_id: uuid, gender:
--   'male'|'female' (identities.attributes.gender), age_min / age_max: 0..150 (identities.age), first_seen_from /
--   first_seen_to / last_seen_from / last_seen_to: ISO timestamps with offset, facility_id: uuid and seen_from /
--   seen_to: a tracking session (in that facility, if given) overlapping the window.
-- Search images: storage files of the organization bucket; `metadata.kind = 'search'` files are visible to their
-- uploader only (storage.files permissions, open_file / delete_file) and may back only the uploader's requests and
-- saved searches; sensitive kinds (profile_document, dsr_export, auth_capture) are never search images.

CREATE FUNCTION itap.valid_search_timestamp(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$
BEGIN
  -- An explicit offset makes the cast independent of the session time zone.
  IF jsonb_typeof(p) IS DISTINCT FROM 'string'
     OR (p #>> '{}') !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}(:?\d{2})?)$' THEN
    RETURN false;
  END IF;
  PERFORM (p #>> '{}')::timestamptz;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

-- Shape of search filters (see header). Never raises; references are checked by itap.search_filter_refs.
CREATE FUNCTION itap.valid_search_filters(p jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  k text;
  v jsonb;
  n numeric;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object' THEN
    RETURN false;
  END IF;
  FOR k, v IN SELECT e.key, e.value FROM jsonb_each(p) e LOOP
    CASE
      WHEN k IN ('status', 'profile_type') THEN
        IF jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) = 0
           OR EXISTS (SELECT 1 FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x) <> 'string') THEN
          RETURN false;
        END IF;
      WHEN k = 'linked' THEN
        IF jsonb_typeof(v) <> 'boolean' THEN
          RETURN false;
        END IF;
      WHEN k IN ('company_id', 'facility_id') THEN
        IF jsonb_typeof(v) <> 'string'
           OR (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          RETURN false;
        END IF;
      WHEN k = 'gender' THEN
        IF v NOT IN ('"male"'::jsonb, '"female"'::jsonb) THEN
          RETURN false;
        END IF;
      WHEN k IN ('age_min', 'age_max') THEN
        IF jsonb_typeof(v) <> 'number' THEN
          RETURN false;
        END IF;
        n := (v #>> '{}')::numeric;
        IF n <> trunc(n) OR n < 0 OR n > 150 THEN
          RETURN false;
        END IF;
      WHEN k IN ('first_seen_from', 'first_seen_to', 'last_seen_from', 'last_seen_to', 'seen_from', 'seen_to') THEN
        IF NOT itap.valid_search_timestamp(v) THEN
          RETURN false;
        END IF;
      ELSE
        RETURN false;
    END CASE;
  END LOOP;
  IF (p ->> 'age_min')::numeric > (p ->> 'age_max')::numeric
     OR (p ->> 'first_seen_from')::timestamptz > (p ->> 'first_seen_to')::timestamptz
     OR (p ->> 'last_seen_from')::timestamptz > (p ->> 'last_seen_to')::timestamptz
     OR (p ->> 'seen_from')::timestamptz > (p ->> 'seen_to')::timestamptz THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

-- Enum values and ids inside filters exist (in the organization). STABLE; true for a NULL / shape-invalid input
-- (the CHECK reports those).
CREATE FUNCTION itap.search_filter_refs(p_org uuid, p jsonb) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT NOT itap.valid_search_filters(p) OR (
    (NOT p ? 'status' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p -> 'status') s(v)
      WHERE NOT EXISTS (SELECT 1 FROM itap.identity_statuses x WHERE x.value = s.v)))
    AND (NOT p ? 'profile_type' OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p -> 'profile_type') s(v)
      WHERE NOT EXISTS (SELECT 1 FROM itap.profile_types x WHERE x.value = s.v)))
    AND (NOT p ? 'company_id' OR EXISTS (
      SELECT 1 FROM itap.companies c WHERE c.organization_id = p_org AND c.id = (p ->> 'company_id')::uuid))
    AND (NOT p ? 'facility_id' OR EXISTS (
      SELECT 1 FROM itap.facilities f WHERE f.organization_id = p_org AND f.id = (p ->> 'facility_id')::uuid)));
$$;

-- BEFORE INSERT OR UPDATE trigger for search_requests / saved_searches. TG_ARGV[0]: the owner column.
--   filters: references checked (search_filters_invalid);
--   image_file_id (new or changed): a file of the organization bucket, not a sensitive kind, and a `search` kind file
--     only when uploaded by the owner (search_image_not_found).
CREATE FUNCTION itap.search_definition_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  v_owner uuid := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  f record;
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.filters IS DISTINCT FROM OLD.filters)
     AND NOT itap.search_filter_refs(NEW.organization_id, NEW.filters) THEN
    PERFORM itap.raise_code('search_filters_invalid');
  END IF;
  IF NEW.image_file_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.image_file_id IS DISTINCT FROM OLD.image_file_id) THEN
    SELECT fl.bucket_id, fl.uploaded_by_user_id, fl.metadata ->> 'kind' AS kind INTO f
    FROM storage.files fl WHERE fl.id = NEW.image_file_id;
    IF NOT FOUND OR f.bucket_id IS DISTINCT FROM NEW.organization_id::text
       OR f.kind IN ('profile_document', 'dsr_export', 'auth_capture')
       OR (f.kind = 'search' AND f.uploaded_by_user_id IS DISTINCT FROM v_owner) THEN
      PERFORM itap.raise_code('search_image_not_found');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE itap.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  search_type text NOT NULL REFERENCES itap.search_types (value),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  threshold real,
  max_results integer NOT NULL DEFAULT 20,
  fuzzy boolean NOT NULL DEFAULT false,
  is_shared boolean NOT NULL DEFAULT false,
  schedule_cron text,
  alert_on_match boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_run_status text,
  last_error text,
  last_search_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_searches_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT saved_searches_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT saved_searches_filters_valid CHECK (itap.valid_search_filters(filters)),
  CONSTRAINT saved_searches_threshold_range CHECK (threshold IS NULL OR threshold BETWEEN 0.2 AND 0.95),
  CONSTRAINT saved_searches_max_results_range CHECK (max_results BETWEEN 1 AND 100),
  CONSTRAINT saved_searches_cron_valid CHECK (schedule_cron IS NULL OR itap.valid_cron(schedule_cron)),
  CONSTRAINT saved_searches_last_run_status CHECK (last_run_status IN ('completed', 'failed', 'skipped')),
  CONSTRAINT saved_searches_owner_fkey FOREIGN KEY (organization_id, owner_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX saved_searches_organization_id_owner_id_idx ON itap.saved_searches (organization_id, owner_id);
CREATE INDEX saved_searches_organization_id_image_file_id_idx ON itap.saved_searches (organization_id, image_file_id);
CREATE INDEX saved_searches_organization_id_last_search_request_id_idx
  ON itap.saved_searches (organization_id, last_search_request_id);
CREATE INDEX saved_searches_organization_id_search_type_idx ON itap.saved_searches (organization_id, search_type);
-- Work for the run_saved_searches cron.
CREATE INDEX saved_searches_due_idx ON itap.saved_searches (next_run_at) WHERE schedule_cron IS NOT NULL;

-- An image is required by facial / combined searches and absent from attribute ones; a saved search whose image
-- file was deleted (FK SET NULL) is kept (its runs fail with image_missing). A changed schedule resets next_run_at.
CREATE FUNCTION itap.saved_searches_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.search_type IS DISTINCT FROM OLD.search_type
     OR NEW.image_file_id IS DISTINCT FROM OLD.image_file_id THEN
    IF NEW.search_type = 'attribute' AND NEW.image_file_id IS NOT NULL THEN
      PERFORM itap.raise_code('search_image_not_allowed');
    END IF;
    IF NEW.search_type <> 'attribute' AND NEW.image_file_id IS NULL
       AND NOT (TG_OP = 'UPDATE' AND OLD.image_file_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.id = OLD.image_file_id)) THEN
      PERFORM itap.raise_code('search_image_required');
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.schedule_cron IS DISTINCT FROM OLD.schedule_cron THEN
    NEW.next_run_at := NULL;
  END IF;
  IF NEW.schedule_cron IS NULL THEN
    NEW.next_run_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER saved_searches_guard BEFORE INSERT OR UPDATE ON itap.saved_searches
  FOR EACH ROW EXECUTE FUNCTION itap.saved_searches_guard();
CREATE TRIGGER saved_searches_definition_guard BEFORE INSERT OR UPDATE ON itap.saved_searches
  FOR EACH ROW EXECUTE FUNCTION itap.search_definition_guard('owner_id');
CREATE TRIGGER saved_searches_set_updated_at BEFORE UPDATE ON itap.saved_searches
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.saved_searches
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:last_run_at', 'ignore:next_run_at', 'ignore:last_run_status', 'ignore:last_error',
    'ignore:last_search_request_id');

CREATE TABLE itap.search_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  saved_search_id uuid,
  search_type text NOT NULL REFERENCES itap.search_types (value),
  image_file_id uuid REFERENCES storage.files (id) ON DELETE SET NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  threshold real,
  max_results integer NOT NULL DEFAULT 20,
  fuzzy boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued' REFERENCES itap.search_statuses (value),
  error text,
  face_count integer,
  results_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  top_confidence real,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_requests_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT search_requests_filters_valid CHECK (itap.valid_search_filters(filters)),
  CONSTRAINT search_requests_threshold_range CHECK (threshold IS NULL OR threshold BETWEEN 0.2 AND 0.95),
  CONSTRAINT search_requests_max_results_range CHECK (max_results BETWEEN 1 AND 100),
  CONSTRAINT search_requests_counts_nonnegative CHECK (
    results_count >= 0 AND (face_count IS NULL OR face_count >= 0) AND (duration_ms IS NULL OR duration_ms >= 0)),
  CONSTRAINT search_requests_user_fkey FOREIGN KEY (organization_id, user_id)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION,
  CONSTRAINT search_requests_saved_search_fkey FOREIGN KEY (organization_id, saved_search_id)
    REFERENCES itap.saved_searches (organization_id, id) ON DELETE SET NULL (saved_search_id)
);
CREATE INDEX search_requests_organization_id_user_id_idx
  ON itap.search_requests (organization_id, user_id, created_at DESC);
CREATE INDEX search_requests_organization_id_saved_search_id_idx ON itap.search_requests (organization_id, saved_search_id);
CREATE INDEX search_requests_organization_id_image_file_id_idx ON itap.search_requests (organization_id, image_file_id);
CREATE INDEX search_requests_organization_id_search_type_idx ON itap.search_requests (organization_id, search_type);
CREATE INDEX search_requests_organization_id_status_idx ON itap.search_requests (organization_id, status);

ALTER TABLE itap.saved_searches ADD CONSTRAINT saved_searches_last_search_request_fkey
  FOREIGN KEY (organization_id, last_search_request_id)
  REFERENCES itap.search_requests (organization_id, id) ON DELETE SET NULL (last_search_request_id);

-- Every writer: status transitions; the definition never changes (the image link may only go NULL).
CREATE FUNCTION itap.search_requests_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'queued' AND NEW.status IN ('running', 'failed'))
    OR (OLD.status = 'running' AND NEW.status IN ('completed', 'failed'))) THEN
    PERFORM itap.raise_code('search_invalid_transition');
  END IF;
  IF (NEW.user_id, NEW.search_type, NEW.filters, NEW.threshold, NEW.max_results, NEW.fuzzy)
       IS DISTINCT FROM (OLD.user_id, OLD.search_type, OLD.filters, OLD.threshold, OLD.max_results, OLD.fuzzy)
     OR (NEW.image_file_id IS DISTINCT FROM OLD.image_file_id AND NEW.image_file_id IS NOT NULL) THEN
    PERFORM itap.raise_code('search_definition_frozen');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER search_requests_guard BEFORE UPDATE ON itap.search_requests
  FOR EACH ROW EXECUTE FUNCTION itap.search_requests_guard();
CREATE TRIGGER search_requests_definition_guard BEFORE INSERT ON itap.search_requests
  FOR EACH ROW EXECUTE FUNCTION itap.search_definition_guard('user_id');
CREATE TRIGGER search_requests_set_updated_at BEFORE UPDATE ON itap.search_requests
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.search_requests
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change(
    'ignore:status', 'ignore:error', 'ignore:face_count', 'ignore:results_count', 'ignore:duration_ms',
    'ignore:top_confidence', 'ignore:started_at', 'ignore:completed_at', 'ignore:image_file_id',
    'ignore:saved_search_id');

CREATE TABLE itap.search_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  search_request_id uuid NOT NULL,
  identity_id uuid,
  profile_id uuid,
  rank integer NOT NULL,
  confidence real,
  match_type text NOT NULL REFERENCES itap.search_match_types (value),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_results_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT search_results_request_rank_key UNIQUE (organization_id, search_request_id, rank),
  CONSTRAINT search_results_rank_positive CHECK (rank >= 1),
  CONSTRAINT search_results_confidence_range CHECK (confidence IS NULL OR confidence BETWEEN -1 AND 1),
  CONSTRAINT search_results_search_request_fkey FOREIGN KEY (organization_id, search_request_id)
    REFERENCES itap.search_requests (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT search_results_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (identity_id),
  CONSTRAINT search_results_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (profile_id)
);
CREATE INDEX search_results_organization_id_identity_id_idx ON itap.search_results (organization_id, identity_id);
CREATE INDEX search_results_organization_id_profile_id_idx ON itap.search_results (organization_id, profile_id);
CREATE INDEX search_results_organization_id_match_type_idx ON itap.search_results (organization_id, match_type);

-- Results are written while their request runs (the seed may back-date completed history under seed_context).
CREATE FUNCTION itap.search_results_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF NOT itap.seed_context() AND NOT EXISTS (
    SELECT 1 FROM itap.search_requests r
    WHERE r.organization_id = NEW.organization_id AND r.id = NEW.search_request_id AND r.status = 'running') THEN
    PERFORM itap.raise_code('search_not_running');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER search_results_guard BEFORE INSERT ON itap.search_results
  FOR EACH ROW EXECUTE FUNCTION itap.search_results_guard();
