-- Per-identity centroids for stage 1 of the two-stage retrieval (SA_6): centroid = l2-normalized mean of the
-- identity's templates (identity_embeddings.is_template, top five by quality). Maintained by triggers:
--   * identity_embeddings insert / delete / move (identity_id) / quality change — the trigger name sorts after
--     identity_embeddings_refresh_templates, so it sees the final template flags of the row event;
--   * identity status: merged / archived identities have no centroid (restored when the status leaves them).
-- No row when the identity has no template. Internal (not exposed); exact scan, no ANN index.
CREATE TABLE itap.identity_centroids (
  identity_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  centroid vector(512) NOT NULL,
  template_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT identity_centroids_organization_id_identity_id_key UNIQUE (organization_id, identity_id),
  CONSTRAINT identity_centroids_template_count_positive CHECK (template_count > 0),
  CONSTRAINT identity_centroids_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE CASCADE
);

-- Recomputes (or removes) one identity's centroid. Serialised with the template upkeep lock of the identity.
CREATE FUNCTION itap.refresh_identity_centroid(p_identity_id uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap, public
AS $$
DECLARE
  org uuid;
  ident_status text;
  mean vector;
  n integer;
BEGIN
  IF p_identity_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM itap.lock_identity_templates(p_identity_id);
  SELECT i.organization_id, i.status INTO org, ident_status FROM itap.identities i WHERE i.id = p_identity_id;
  IF NOT FOUND OR ident_status IN ('merged', 'archived') THEN
    DELETE FROM itap.identity_centroids WHERE identity_id = p_identity_id;
    RETURN;
  END IF;
  SELECT avg(e.embedding), count(*) INTO mean, n
  FROM itap.identity_embeddings e
  WHERE e.organization_id = org AND e.identity_id = p_identity_id AND e.is_template;
  IF n = 0 THEN
    DELETE FROM itap.identity_centroids WHERE identity_id = p_identity_id;
    RETURN;
  END IF;
  INSERT INTO itap.identity_centroids AS c (identity_id, organization_id, centroid, template_count)
  VALUES (p_identity_id, org, l2_normalize(mean), n)
  ON CONFLICT (identity_id) DO UPDATE
  SET centroid = excluded.centroid, template_count = excluded.template_count, updated_at = now();
END;
$$;

CREATE FUNCTION itap.identity_embeddings_sync_centroid() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM itap.refresh_identity_centroid(OLD.identity_id);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.identity_id IS DISTINCT FROM OLD.identity_id) THEN
    PERFORM itap.refresh_identity_centroid(NEW.identity_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER identity_embeddings_sync_centroid
  AFTER INSERT OR DELETE OR UPDATE OF identity_id, quality_score ON itap.identity_embeddings
  FOR EACH ROW EXECUTE FUNCTION itap.identity_embeddings_sync_centroid();

CREATE FUNCTION itap.identities_sync_centroid() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  PERFORM itap.refresh_identity_centroid(NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER identities_sync_centroid AFTER UPDATE OF status ON itap.identities
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        AND (OLD.status IN ('merged', 'archived') OR NEW.status IN ('merged', 'archived')))
  EXECUTE FUNCTION itap.identities_sync_centroid();

-- Backfill existing identities.
SELECT itap.refresh_identity_centroid(i.id)
FROM itap.identities i
WHERE EXISTS (SELECT 1 FROM itap.identity_embeddings e WHERE e.identity_id = i.id AND e.is_template);
