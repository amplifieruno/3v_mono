-- Access decisions (spec §6.13, SA_5 §2.1.4 decision audit): one row per evaluated request, written only by the
-- decision engine (check_access / evaluate_access, slice 8 task 2). Append-only, read-only for org_admin, not
-- audited (high volume), created_at only. `signals` holds the full evaluation trace (evaluated versions in order,
-- matched subject / target, schedule result, grant, override, contextual signals, risk components) so a decision is
-- reproducible from its record; `epoch` is the organization policy epoch the decision used.
-- References to people / devices / places are SET NULL (logs keep their row, spec §6.0); the policy version,
-- grant and override that decided are NO ACTION (attribution is kept: such configuration is archived/revoked/ended,
-- never deleted). Events point here through events.access_decision_id (plain uuid, log-to-log).
CREATE TABLE itap.access_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES itap.organizations (id) ON DELETE CASCADE,
  facility_id uuid,
  access_point_id uuid,
  device_id uuid,
  identity_id uuid,
  profile_id uuid,
  result text NOT NULL REFERENCES itap.access_decision_results (value),
  reason text NOT NULL REFERENCES itap.access_decision_reasons (value),
  policy_version_id uuid,
  grant_id uuid,
  override_id uuid,
  risk_score numeric(4, 3),
  signals jsonb NOT NULL DEFAULT '{}',
  epoch bigint NOT NULL,
  latency_ms numeric(10, 3),
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_decisions_organization_id_id_key UNIQUE (organization_id, id),
  CONSTRAINT access_decisions_signals_object CHECK (jsonb_typeof(signals) = 'object'),
  CONSTRAINT access_decisions_risk_range CHECK (risk_score IS NULL OR risk_score BETWEEN 0 AND 1),
  CONSTRAINT access_decisions_latency_nonnegative CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT access_decisions_epoch_nonnegative CHECK (epoch >= 0),
  CONSTRAINT access_decisions_access_point_needs_facility CHECK (access_point_id IS NULL OR facility_id IS NOT NULL),
  CONSTRAINT access_decisions_facility_fkey FOREIGN KEY (organization_id, facility_id)
    REFERENCES itap.facilities (organization_id, id) ON DELETE SET NULL (facility_id),
  CONSTRAINT access_decisions_access_point_fkey FOREIGN KEY (organization_id, facility_id, access_point_id)
    REFERENCES itap.access_points (organization_id, facility_id, id) ON DELETE SET NULL (access_point_id),
  CONSTRAINT access_decisions_device_fkey FOREIGN KEY (organization_id, device_id)
    REFERENCES itap.devices (organization_id, id) ON DELETE SET NULL (device_id),
  CONSTRAINT access_decisions_identity_fkey FOREIGN KEY (organization_id, identity_id)
    REFERENCES itap.identities (organization_id, id) ON DELETE SET NULL (identity_id),
  CONSTRAINT access_decisions_profile_fkey FOREIGN KEY (organization_id, profile_id)
    REFERENCES itap.profiles (organization_id, id) ON DELETE SET NULL (profile_id),
  CONSTRAINT access_decisions_policy_version_fkey FOREIGN KEY (organization_id, policy_version_id)
    REFERENCES itap.access_policy_versions (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT access_decisions_grant_fkey FOREIGN KEY (organization_id, grant_id)
    REFERENCES itap.access_grants (organization_id, id) ON DELETE NO ACTION,
  CONSTRAINT access_decisions_override_fkey FOREIGN KEY (organization_id, override_id)
    REFERENCES itap.emergency_overrides (organization_id, id) ON DELETE NO ACTION
);
CREATE INDEX access_decisions_organization_id_access_point_id_decided_at_idx
  ON itap.access_decisions (organization_id, access_point_id, decided_at);
CREATE INDEX access_decisions_organization_id_profile_id_decided_at_idx
  ON itap.access_decisions (organization_id, profile_id, decided_at);
CREATE INDEX access_decisions_organization_id_decided_at_idx ON itap.access_decisions (organization_id, decided_at);
CREATE INDEX access_decisions_organization_id_result_decided_at_idx ON itap.access_decisions (organization_id, result, decided_at);
CREATE INDEX access_decisions_organization_id_reason_decided_at_idx ON itap.access_decisions (organization_id, reason, decided_at);
CREATE INDEX access_decisions_organization_id_facility_id_access_point_id_idx
  ON itap.access_decisions (organization_id, facility_id, access_point_id);
CREATE INDEX access_decisions_organization_id_device_id_idx ON itap.access_decisions (organization_id, device_id);
CREATE INDEX access_decisions_organization_id_identity_id_decided_at_idx
  ON itap.access_decisions (organization_id, identity_id, decided_at);
CREATE INDEX access_decisions_organization_id_policy_version_id_idx ON itap.access_decisions (organization_id, policy_version_id);
CREATE INDEX access_decisions_organization_id_grant_id_idx ON itap.access_decisions (organization_id, grant_id);
CREATE INDEX access_decisions_organization_id_override_id_idx ON itap.access_decisions (organization_id, override_id);
