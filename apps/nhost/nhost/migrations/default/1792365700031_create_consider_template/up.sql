-- itap.consider_template (spec §7): the live recognition pipeline offers a new embedding of a recognised identity;
-- it is stored only if it beats the worst of the identity's top-5 templates (or the identity has fewer than five),
-- so camera captures never overwrite or flood stored embeddings. Atomic: serialized per identity with the template
-- upkeep lock (itap.lock_identity_templates), checked and inserted in one call; itap.refresh_templates (insert
-- trigger) then re-ranks. With p_photo_file_id the crop is recorded as an identity photo (kind capture, device,
-- captured_at) and referenced by the embedding.
-- Guards: an identity outside p_organization_id, merged or archived, or with matching disabled gets nothing (an
-- empty result, not an error: the pipeline simply skips the template). Enrollment keeps storing all its embeddings.
-- Internal: tracked for no role (admin secret only, called by the backend recognition session).
CREATE FUNCTION itap.consider_template(
  p_organization_id uuid,
  p_identity_id uuid,
  p_embedding text,
  p_quality real,
  p_model_version text DEFAULT NULL,
  p_photo_file_id uuid DEFAULT NULL,
  p_device_id uuid DEFAULT NULL,
  p_captured_at timestamptz DEFAULT NULL,
  p_source_detection_id uuid DEFAULT NULL
)
RETURNS SETOF itap.identity_embeddings
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, public, itap
AS $$
DECLARE
  new_id uuid;
  template_count integer;
  worst real;
BEGIN
  IF p_quality IS NULL OR p_identity_id IS NULL OR p_organization_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM itap.lock_identity_templates(p_identity_id);
  PERFORM 1 FROM itap.identities i
  WHERE i.organization_id = p_organization_id AND i.id = p_identity_id
    AND i.matching_enabled AND i.status NOT IN ('merged', 'archived');
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*), min(e.quality_score) INTO template_count, worst
  FROM itap.identity_embeddings e
  WHERE e.organization_id = p_organization_id AND e.identity_id = p_identity_id AND e.is_template;
  IF template_count >= 5 AND p_quality <= coalesce(worst, 0) THEN
    RETURN;
  END IF;

  IF p_photo_file_id IS NOT NULL THEN
    INSERT INTO itap.identity_photos (organization_id, identity_id, file_id, kind, quality_score, captured_at, device_id)
    VALUES (p_organization_id, p_identity_id, p_photo_file_id, 'capture', p_quality, p_captured_at, p_device_id);
  END IF;
  INSERT INTO itap.identity_embeddings (
    organization_id, identity_id, embedding, quality_score, model_version, source_detection_id, photo_file_id
  )
  VALUES (
    p_organization_id, p_identity_id, p_embedding::vector(512), p_quality, p_model_version, p_source_detection_id,
    p_photo_file_id
  )
  RETURNING id INTO new_id;
  -- Read back after the AFTER INSERT template refresh, so is_template is current.
  RETURN QUERY SELECT * FROM itap.identity_embeddings WHERE id = new_id;
END;
$$;
