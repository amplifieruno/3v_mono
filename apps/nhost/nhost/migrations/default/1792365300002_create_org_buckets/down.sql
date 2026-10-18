DROP TRIGGER organizations_create_bucket ON itap.organizations;
DROP FUNCTION itap.create_org_bucket();

-- Only empty buckets are removed: storage.files cascades from buckets and would orphan MinIO objects.
DELETE FROM storage.buckets b
WHERE (b.id = 'org-logos' OR b.id IN (SELECT o.id::text FROM itap.organizations o))
  AND NOT EXISTS (SELECT 1 FROM storage.files f WHERE f.bucket_id = b.id);
