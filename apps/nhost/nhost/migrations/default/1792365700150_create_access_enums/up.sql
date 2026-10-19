-- Physical access control enums (spec §6.13, slice 8).
CREATE TABLE itap.access_effects (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.access_effects (value, description) VALUES
  ('allow', 'The policy version grants access'),
  ('deny', 'The policy version refuses access');

CREATE TABLE itap.override_modes (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.override_modes (value, description) VALUES
  ('unlock_all', 'Every covered door opens for everyone'),
  ('lock_all', 'Every covered door refuses everyone, grants included'),
  ('evacuation', 'Exits open for everyone (direction known), entries follow normal evaluation');

CREATE TABLE itap.access_decision_results (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.access_decision_results (value, description) VALUES
  ('granted', 'Access granted'),
  ('denied', 'Access denied');

-- Why a decision came out the way it did (the first step of the evaluation order that decided).
CREATE TABLE itap.access_decision_reasons (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.access_decision_reasons (value, description) VALUES
  ('override_lock', 'An active lock_all emergency override covers the door'),
  ('override_unlock', 'An active unlock_all emergency override covers the door'),
  ('override_evacuation', 'An active evacuation override opens this exit'),
  ('policy_deny', 'The first matching published policy version denies'),
  ('policy_allow', 'The first matching published policy version allows'),
  ('grant', 'A valid access grant allows (no deny matched)'),
  ('risk_exceeded', 'An allow was turned into a deny: the risk score is above the version''s max_risk'),
  ('outside_schedule', 'Default deny; a version covering the person and door exists but its schedule or validity excludes the instant'),
  ('no_rule', 'Default deny: no policy version or grant matched'),
  ('unknown_person', 'Default deny: the person has no profile'),
  ('profile_inactive', 'Denied: the profile is suspended, inactive or terminated');
