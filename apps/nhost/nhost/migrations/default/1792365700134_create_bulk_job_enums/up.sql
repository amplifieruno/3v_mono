-- Bulk job enums (spec §6.11, SA_3 §2.1.2 / §2.1.4): job kinds, job states and per-row outcomes.
CREATE TABLE itap.bulk_job_kinds (value text PRIMARY KEY, description text);
INSERT INTO itap.bulk_job_kinds (value, description) VALUES
  ('profile_import', 'Create profiles from a CSV file'),
  ('profile_update', 'Update profiles found by a key column (employee_id, email or code) from a CSV file'),
  ('bulk_search', 'Face search for every image listed in a CSV file');

CREATE TABLE itap.bulk_job_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.bulk_job_statuses (value, description) VALUES
  ('queued', 'Waiting to run (new or retried)'),
  ('running', 'Rows are being applied (leased by a worker)'),
  ('completed', 'Every row succeeded (or was blank)'),
  ('partial', 'Some rows failed, the others were committed'),
  ('failed', 'The job failed (error) or every row failed'),
  ('cancelled', 'Stopped by a user; rows applied so far stay');

CREATE TABLE itap.bulk_job_row_outcomes (value text PRIMARY KEY, description text);
INSERT INTO itap.bulk_job_row_outcomes (value, description) VALUES
  ('created', 'Profile created'),
  ('updated', 'Profile updated'),
  ('validated', 'Dry run: the row is valid, nothing was committed'),
  ('skipped', 'Blank record'),
  ('failed', 'The row was rejected (error)'),
  ('matched', 'Search found at least one identity'),
  ('no_match', 'Search found no identity');
