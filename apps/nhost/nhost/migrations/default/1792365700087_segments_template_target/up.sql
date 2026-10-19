-- A segment's template has the segment's target: the template FK carries target.
ALTER TABLE itap.segment_templates
  ADD CONSTRAINT segment_templates_organization_id_id_target_key UNIQUE (organization_id, id, target);
ALTER TABLE itap.segments DROP CONSTRAINT segments_template_fkey;
ALTER TABLE itap.segments ADD CONSTRAINT segments_template_fkey FOREIGN KEY (organization_id, template_id, target)
  REFERENCES itap.segment_templates (organization_id, id, target) ON DELETE SET NULL (template_id);
DROP INDEX itap.segments_organization_id_template_id_idx;
CREATE INDEX segments_organization_id_template_id_target_idx ON itap.segments (organization_id, template_id, target);
