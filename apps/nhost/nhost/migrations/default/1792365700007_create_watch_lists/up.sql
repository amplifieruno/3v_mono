-- Watch lists (spec §6.9): named lists of kind watch / blacklist / vip with a severity (used by Stage B for
-- watchlist_match / blacklist_match / vip_arrival events) and a display color. Entries are owned children of the
-- list (CASCADE) and point at exactly one identity or profile; expiry is implicit (expires_at in the past = not
-- active). added_by is stamped from the session member.
CREATE TABLE itap.watch_list_kinds (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.watch_list_kinds (value, description) VALUES
  ('watch', 'Watch list: notify when seen'),
  ('blacklist', 'Blacklist: not allowed on the premises'),
  ('vip', 'VIP: announce arrival');

CREATE TABLE itap.watch_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  kind text NOT NULL REFERENCES itap.watch_list_kinds (value),
  severity text NOT NULL DEFAULT 'medium' REFERENCES itap.event_severities (value),
  -- '#rrggbb'
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_lists_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT watch_lists_organization_id_name_key UNIQUE (organization_id, name),
  CONSTRAINT watch_lists_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT watch_lists_color_hex CHECK (color IS NULL OR color ~ '^#[0-9a-fA-F]{6}$')
);
CREATE INDEX watch_lists_organization_id_kind_idx ON itap.watch_lists (organization_id, kind);
CREATE INDEX watch_lists_organization_id_severity_idx ON itap.watch_lists (organization_id, severity);

CREATE TRIGGER watch_lists_set_updated_at BEFORE UPDATE ON itap.watch_lists
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.watch_lists
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

CREATE TABLE itap.watch_list_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  watch_list_id uuid NOT NULL,
  identity_id uuid,
  profile_id uuid,
  reason text,
  added_by uuid,
  -- NULL = never expires.
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_list_entries_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT watch_list_entries_exactly_one_subject CHECK (num_nonnulls(identity_id, profile_id) = 1),
  CONSTRAINT watch_list_entries_watch_list_fkey FOREIGN KEY (organization_id, watch_list_id)
    REFERENCES itap.watch_lists (organization_id, id) ON DELETE CASCADE,
  -- The entry is meaningless without its subject (owned junction row).
  CONSTRAINT watch_list_entries_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT watch_list_entries_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT watch_list_entries_added_by_fkey FOREIGN KEY (organization_id, added_by)
    REFERENCES itap.organization_members (organization_id, user_id) ON DELETE NO ACTION
);
CREATE INDEX watch_list_entries_organization_id_watch_list_id_idx ON itap.watch_list_entries (organization_id, watch_list_id);
CREATE INDEX watch_list_entries_organization_id_identity_id_idx ON itap.watch_list_entries (organization_id, identity_id);
CREATE INDEX watch_list_entries_organization_id_profile_id_idx ON itap.watch_list_entries (organization_id, profile_id);
CREATE INDEX watch_list_entries_organization_id_added_by_idx ON itap.watch_list_entries (organization_id, added_by);
-- One entry per subject and list (per branch of the exactly-one CHECK).
CREATE UNIQUE INDEX watch_list_entries_identity_key ON itap.watch_list_entries (organization_id, watch_list_id, identity_id)
  WHERE identity_id IS NOT NULL;
CREATE UNIQUE INDEX watch_list_entries_profile_key ON itap.watch_list_entries (organization_id, watch_list_id, profile_id)
  WHERE profile_id IS NOT NULL;

CREATE TRIGGER watch_list_entries_stamp_added_by BEFORE INSERT ON itap.watch_list_entries
  FOR EACH ROW EXECUTE FUNCTION itap.stamp_session_member('added_by');
CREATE TRIGGER watch_list_entries_set_updated_at BEFORE UPDATE ON itap.watch_list_entries
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON itap.watch_list_entries
  FOR EACH ROW EXECUTE FUNCTION itap.audit_row_change();

-- Watch lists with an entry active at p_at for the identity itself or for its profile (Stage B, spec §8.2).
-- Distinct lists; a list with both an identity and a profile entry appears once.
CREATE FUNCTION itap.identity_watch_lists(p_organization_id uuid, p_identity_id uuid, p_at timestamptz)
RETURNS SETOF itap.watch_lists
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT l.*
  FROM itap.watch_lists l
  WHERE l.organization_id = p_organization_id
    AND EXISTS (
      SELECT 1
      FROM itap.watch_list_entries e
      WHERE e.organization_id = l.organization_id AND e.watch_list_id = l.id
        AND (e.expires_at IS NULL OR e.expires_at > p_at)
        AND (
          e.identity_id = p_identity_id
          OR e.profile_id = (
            SELECT i.profile_id FROM itap.identities i
            WHERE i.organization_id = p_organization_id AND i.id = p_identity_id
          )
        )
    );
$$;

-- Computed field profiles.is_blacklisted (spec §6.4): an unexpired entry of a blacklist-kind list for the profile
-- or for any of its identities that is not merged (a merged source keeps its profile_id but is history).
CREATE FUNCTION itap.profile_is_blacklisted(profile_row itap.profiles) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM itap.watch_list_entries e
    JOIN itap.watch_lists l ON l.organization_id = e.organization_id AND l.id = e.watch_list_id
    WHERE e.organization_id = profile_row.organization_id
      AND l.kind = 'blacklist'
      AND (e.expires_at IS NULL OR e.expires_at > now())
      AND (
        e.profile_id = profile_row.id
        OR e.identity_id IN (
          SELECT i.id FROM itap.identities i
          WHERE i.organization_id = profile_row.organization_id AND i.profile_id = profile_row.id
            AND i.status <> 'merged'
        )
      )
  );
$$;
