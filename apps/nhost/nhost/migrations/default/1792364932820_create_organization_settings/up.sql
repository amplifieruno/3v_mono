CREATE TABLE itap.organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES itap.organizations (id) ON DELETE CASCADE,
  recognition_threshold real NOT NULL DEFAULT 0.5,
  tracking_timeout_seconds int NOT NULL DEFAULT 300,
  archive_unknown_after_days int NOT NULL DEFAULT 90,
  tailgating_window_seconds int NOT NULL DEFAULT 5,
  default_retention_days int NOT NULL DEFAULT 90,
  detection_counter_throttle_seconds int NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER organization_settings_set_updated_at
  BEFORE UPDATE ON itap.organization_settings
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();

-- One settings row per organization, created with it (reseed-safe).
CREATE FUNCTION itap.create_organization_settings() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO itap.organization_settings (organization_id) VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_create_settings
  AFTER INSERT ON itap.organizations
  FOR EACH ROW EXECUTE FUNCTION itap.create_organization_settings();
