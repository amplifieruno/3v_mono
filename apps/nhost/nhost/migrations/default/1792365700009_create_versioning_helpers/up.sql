-- Versioned entities (spec §6.0, §8.1 version_published): a header row (`current_version_id` = what is enforced)
-- plus version rows (status draft / pending_approval / published / superseded) that own their children (scopes,
-- subjects, targets). Shared by event rules (this slice) and access policies (slice 8). Conventions a versioned
-- entity must follow to use these helpers:
--   header  : organization_id, id, current_version_id (read-only in metadata);
--   versions: organization_id, id, <parent column> (e.g. rule_id), version integer, status -> version_statuses,
--             published_by, published_at; UNIQUE (organization_id, <parent>, version); partial unique
--             (organization_id, <parent>) WHERE status = 'published' and WHERE status IN ('draft','pending_approval');
--   children: organization_id, id, version_id (CASCADE from the version).
-- Triggers:
--   versions BEFORE INSERT: itap.assign_version_number('<parent column>', '<schema.header table>');
--   versions BEFORE INSERT OR UPDATE: itap.guard_version_status();
--   children BEFORE INSERT OR UPDATE OR DELETE: itap.guard_version_children('version_id', '<schema.versions table>').
-- Functions (internal, called by per-entity tracked wrappers that resolve the session organization):
--   itap.create_draft_version(versions, header, parent column, children[], org, parent) -> draft id;
--   itap.publish_version(versions, header, parent column, org, version, actor) -> parent id.
-- Slice 8: access_policy_versions use the same triggers and call these functions with their own tables.
-- Status published/superseded is reserved for publish_version (transaction-local flag itap.version_context).

CREATE TABLE itap.version_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.version_statuses (value, description) VALUES
  ('draft', 'Being edited'),
  ('pending_approval', 'Submitted for approval'),
  ('published', 'Enforced (the header''s current version)'),
  ('superseded', 'Replaced by a later published version');

-- Next version number per header; locks the header row first, which serialises numbering, drafting and
-- publishing per header.
CREATE FUNCTION itap.assign_version_number() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  parent_column text := TG_ARGV[0];
  header_table regclass := TG_ARGV[1]::regclass;
  parent uuid;
  next_version integer;
BEGIN
  IF parent_column IS NULL OR NOT (to_jsonb(NEW) ? parent_column) THEN
    RAISE EXCEPTION USING ERRCODE = 'undefined_column', MESSAGE = 'assign_version_number: unknown column ' || coalesce(parent_column, '<none>');
  END IF;
  parent := (to_jsonb(NEW) ->> parent_column)::uuid;
  IF parent IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT 1 FROM %s WHERE organization_id = $1 AND id = $2 FOR UPDATE', header_table)
    USING NEW.organization_id, parent;
  IF NEW.version IS NULL THEN
    EXECUTE format(
      'SELECT coalesce(max(version), 0) + 1 FROM %I.%I WHERE organization_id = $1 AND %I = $2',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, parent_column
    ) INTO next_version USING NEW.organization_id, parent;
    NEW.version := next_version;
  END IF;
  RETURN NEW;
END;
$$;

-- Published and superseded versions are frozen: their status changes only inside publish_version, and their
-- content columns never change.
CREATE FUNCTION itap.guard_version_status() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  in_context boolean := coalesce(current_setting('itap.version_context', true), '') = 'on';
  frozen text[] := ARRAY['published', 'superseded'];
  meta text[] := ARRAY['status', 'published_by', 'published_at', 'updated_at'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = ANY (frozen) AND NOT in_context THEN
      PERFORM itap.raise_code('version_status_reserved');
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND (NEW.status = ANY (frozen) OR OLD.status = ANY (frozen))
     AND NOT in_context THEN
    PERFORM itap.raise_code('version_status_reserved');
  END IF;
  IF OLD.status = ANY (frozen) AND (to_jsonb(NEW) - meta) IS DISTINCT FROM (to_jsonb(OLD) - meta) THEN
    PERFORM itap.raise_code('version_not_editable');
  END IF;
  RETURN NEW;
END;
$$;

-- Children of a version can change only while the version is a draft or pending approval. A missing version
-- (cascade from the version, its header or the organization) or a missing organization lets the change through.
CREATE FUNCTION itap.guard_version_children() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
DECLARE
  version_column text := TG_ARGV[0];
  versions_table regclass := TG_ARGV[1]::regclass;
  r jsonb;
  version_status text;
BEGIN
  FOR r IN
    SELECT x FROM unnest(
      CASE TG_OP
        WHEN 'INSERT' THEN ARRAY[to_jsonb(NEW)]
        WHEN 'DELETE' THEN ARRAY[to_jsonb(OLD)]
        ELSE ARRAY[to_jsonb(OLD), to_jsonb(NEW)]
      END
    ) x
  LOOP
    IF NOT (r ? version_column) THEN
      RAISE EXCEPTION USING ERRCODE = 'undefined_column', MESSAGE = 'guard_version_children: unknown column ' || version_column;
    END IF;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM itap.organizations o WHERE o.id = (r ->> 'organization_id')::uuid);
    version_status := NULL;
    EXECUTE format('SELECT status FROM %s WHERE organization_id = $1 AND id = $2', versions_table)
      INTO version_status USING (r ->> 'organization_id')::uuid, (r ->> version_column)::uuid;
    IF version_status IS NOT NULL AND version_status NOT IN ('draft', 'pending_approval') THEN
      PERFORM itap.raise_code('version_not_editable');
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Columns of a table to copy into a new row: all stored, non-generated columns except the excluded ones.
CREATE FUNCTION itap.copyable_columns(p_table regclass, p_exclude text[]) RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  FROM pg_attribute a
  WHERE a.attrelid = p_table AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attgenerated = '' AND a.attidentity = ''
    AND a.attname <> ALL (p_exclude);
$$;

-- The open (draft / pending_approval) version of the header, creating it when there is none: a copy of the
-- current version (else of the latest version, else an empty draft) with copies of its children. Editing a
-- published rule/policy = editing this draft. Returns the draft id.
CREATE FUNCTION itap.create_draft_version(
  p_versions regclass,
  p_headers regclass,
  p_parent_column text,
  p_children regclass[],
  p_organization_id uuid,
  p_parent uuid
) RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  locked integer;
  source_version uuid;
  draft uuid;
  cols text;
  child regclass;
BEGIN
  EXECUTE format('SELECT current_version_id FROM %s WHERE organization_id = $1 AND id = $2 FOR UPDATE', p_headers)
    INTO source_version USING p_organization_id, p_parent;
  GET DIAGNOSTICS locked = ROW_COUNT;
  IF locked = 0 THEN
    PERFORM itap.raise_code('version_parent_not_found');
  END IF;
  EXECUTE format(
    'SELECT id FROM %s WHERE organization_id = $1 AND %I = $2 AND status IN (''draft'', ''pending_approval'')',
    p_versions, p_parent_column
  ) INTO draft USING p_organization_id, p_parent;
  IF draft IS NOT NULL THEN
    RETURN draft;
  END IF;
  IF source_version IS NULL THEN
    EXECUTE format('SELECT id FROM %s WHERE organization_id = $1 AND %I = $2 ORDER BY version DESC LIMIT 1',
      p_versions, p_parent_column)
      INTO source_version USING p_organization_id, p_parent;
  END IF;
  IF source_version IS NULL THEN
    EXECUTE format('INSERT INTO %s (organization_id, %I) VALUES ($1, $2) RETURNING id', p_versions, p_parent_column)
      INTO draft USING p_organization_id, p_parent;
    RETURN draft;
  END IF;
  cols := itap.copyable_columns(
    p_versions, ARRAY['id', 'status', 'version', 'published_by', 'published_at', 'created_at', 'updated_at']
  );
  EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM %s WHERE organization_id = $1 AND id = $2 RETURNING id',
    p_versions, cols, cols, p_versions)
    INTO draft USING p_organization_id, source_version;
  FOREACH child IN ARRAY coalesce(p_children, '{}') LOOP
    cols := itap.copyable_columns(child, ARRAY['id', 'version_id', 'created_at', 'updated_at']);
    EXECUTE format('INSERT INTO %s (version_id, %s) SELECT $3, %s FROM %s WHERE organization_id = $1 AND version_id = $2',
      child, cols, cols, child)
      USING p_organization_id, source_version, draft;
  END LOOP;
  RETURN draft;
END;
$$;

-- Publishes a version (draft, pending approval, or superseded = rollback): the previously published version of the
-- header becomes superseded, this one published (published_by / published_at), and the header's
-- current_version_id points at it. Returns the header id. Raises version_not_found / version_already_published.
CREATE FUNCTION itap.publish_version(
  p_versions regclass,
  p_headers regclass,
  p_parent_column text,
  p_organization_id uuid,
  p_version uuid,
  p_actor uuid
) RETURNS uuid
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, itap
AS $$
DECLARE
  parent uuid;
  version_status text;
BEGIN
  EXECUTE format('SELECT %I FROM %s WHERE organization_id = $1 AND id = $2', p_parent_column, p_versions)
    INTO parent USING p_organization_id, p_version;
  IF parent IS NULL THEN
    PERFORM itap.raise_code('version_not_found');
  END IF;
  -- Header first (same order as assign_version_number / create_draft_version), then the version.
  EXECUTE format('SELECT 1 FROM %s WHERE organization_id = $1 AND id = $2 FOR UPDATE', p_headers)
    USING p_organization_id, parent;
  EXECUTE format('SELECT status FROM %s WHERE organization_id = $1 AND id = $2 FOR UPDATE', p_versions)
    INTO version_status USING p_organization_id, p_version;
  IF version_status = 'published' THEN
    PERFORM itap.raise_code('version_already_published');
  END IF;
  PERFORM set_config('itap.version_context', 'on', true);
  EXECUTE format(
    'UPDATE %s SET status = ''superseded'' WHERE organization_id = $1 AND %I = $2 AND status = ''published''',
    p_versions, p_parent_column
  ) USING p_organization_id, parent;
  EXECUTE format(
    'UPDATE %s SET status = ''published'', published_by = $3, published_at = now() WHERE organization_id = $1 AND id = $2',
    p_versions
  ) USING p_organization_id, p_version, p_actor;
  EXECUTE format('UPDATE %s SET current_version_id = $3 WHERE organization_id = $1 AND id = $2', p_headers)
    USING p_organization_id, parent, p_version;
  PERFORM set_config('itap.version_context', 'off', true);
  RETURN parent;
END;
$$;
