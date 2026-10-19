-- itap.consider_template: with five templates, a capture must beat the worst one by more than 0.05 quality (was:
-- any improvement). Camera frames of one person differ by noise-level quality steps; without a margin nearly every
-- frame that is a hair better added another stored embedding and crop.
CREATE OR REPLACE FUNCTION itap.consider_template(
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
  IF template_count >= 5 AND p_quality <= coalesce(worst, 0) + 0.05 THEN
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
