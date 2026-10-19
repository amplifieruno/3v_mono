DROP INDEX itap.segments_organization_id_template_id_target_idx;
CREATE INDEX segments_organization_id_template_id_idx ON itap.segments (organization_id, template_id);
ALTER TABLE itap.segments DROP CONSTRAINT segments_template_fkey;
ALTER TABLE itap.segments ADD CONSTRAINT segments_template_fkey FOREIGN KEY (organization_id, template_id)
  REFERENCES itap.segment_templates (organization_id, id) ON DELETE SET NULL (template_id);
ALTER TABLE itap.segment_templates DROP CONSTRAINT segment_templates_organization_id_id_target_key;
