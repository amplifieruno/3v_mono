-- Template upkeep locks (migration *_create_template_upkeep): an embedding moving between two identities takes both
-- identities' advisory locks in uuid order before refreshing either, so two opposite moves cannot deadlock.
-- Multi-identity functions (merge, rollback, split) call itap.lock_identity_templates in uuid order up front.
CREATE FUNCTION itap.lock_identity_templates(p_identity_id uuid) RETURNS void
LANGUAGE sql
SET search_path = pg_catalog, itap
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('itap.refresh_templates:' || p_identity_id::text, 0));
$$;

CREATE OR REPLACE FUNCTION itap.refresh_templates(p_identity_id uuid) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF p_identity_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM itap.lock_identity_templates(p_identity_id);
  WITH ranked AS (
    SELECT id,
           row_number() OVER (ORDER BY quality_score DESC NULLS LAST, created_at DESC, id) <= 5 AS should_be_template
    FROM itap.identity_embeddings
    WHERE identity_id = p_identity_id
  )
  UPDATE itap.identity_embeddings e
  SET is_template = r.should_be_template
  FROM ranked r
  WHERE e.id = r.id AND e.is_template IS DISTINCT FROM r.should_be_template;
END;
$$;

CREATE OR REPLACE FUNCTION itap.identity_embeddings_refresh_templates() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, itap
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.identity_id IS DISTINCT FROM OLD.identity_id THEN
    PERFORM itap.lock_identity_templates(least(OLD.identity_id, NEW.identity_id));
    PERFORM itap.lock_identity_templates(greatest(OLD.identity_id, NEW.identity_id));
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM itap.refresh_templates(OLD.identity_id);
  END IF;
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.identity_id IS DISTINCT FROM OLD.identity_id) THEN
    PERFORM itap.refresh_templates(NEW.identity_id);
  END IF;
  RETURN NULL;
END;
$$;
