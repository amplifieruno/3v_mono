-- Deferred from slice 2: the capturing device. Existing rows carry no device (NULL), so the FK validates immediately.
-- The photo outlives its device: only device_id is nulled, never organization_id.
ALTER TABLE itap.identity_photos ADD CONSTRAINT identity_photos_device_fkey
  FOREIGN KEY (organization_id, device_id) REFERENCES itap.devices (organization_id, id) ON DELETE SET NULL (device_id);
CREATE INDEX identity_photos_organization_id_device_id_idx ON itap.identity_photos (organization_id, device_id);
