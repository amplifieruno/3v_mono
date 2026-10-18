-- One storage bucket per organization (bucket id = organization uuid as text), plus the shared `org-logos` bucket.
-- Bucket settings are the Nhost defaults. ON CONFLICT DO NOTHING keeps reseeding safe.
CREATE FUNCTION itap.create_org_bucket() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, storage
AS $$
BEGIN
  INSERT INTO storage.buckets (id) VALUES (NEW.id::text) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_create_bucket
  AFTER INSERT ON itap.organizations
  FOR EACH ROW EXECUTE FUNCTION itap.create_org_bucket();

-- Buckets for organizations that already exist.
INSERT INTO storage.buckets (id) SELECT id::text FROM itap.organizations ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets (id) VALUES ('org-logos') ON CONFLICT DO NOTHING;
