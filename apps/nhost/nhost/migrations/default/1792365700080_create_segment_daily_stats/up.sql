-- Daily segment trend and churn (spec §6.5, SA_3): one row per segment and day (organization timezone), written by
-- the stats aggregation (read-only for org_admin, not audited). member_count = open members at the end of the day;
-- added / removed = membership rows opened / closed during the day.
CREATE TABLE itap.segment_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  segment_id uuid NOT NULL,
  day date NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  added integer NOT NULL DEFAULT 0,
  removed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT segment_daily_stats_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT segment_daily_stats_organization_id_segment_id_day_key UNIQUE (organization_id, segment_id, day),
  CONSTRAINT segment_daily_stats_counts_nonnegative CHECK (member_count >= 0 AND added >= 0 AND removed >= 0),
  CONSTRAINT segment_daily_stats_segment_fkey FOREIGN KEY (organization_id, segment_id)
    REFERENCES itap.segments (organization_id, id) ON DELETE CASCADE
);
CREATE INDEX segment_daily_stats_organization_id_day_idx ON itap.segment_daily_stats (organization_id, day);
CREATE TRIGGER segment_daily_stats_set_updated_at BEFORE UPDATE ON itap.segment_daily_stats
  FOR EACH ROW EXECUTE FUNCTION itap.set_updated_at();
