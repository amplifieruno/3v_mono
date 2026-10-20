-- Compliance, governance, integrations and exports enums (spec §6.14, §6.15; slice 10 task 1).

-- Data classes of the retention engine (spec list extended by the slice 7-9 purge lists). Each class is purged by one
-- SQL function itap.purge_<class> (task 2); itap.retention_class_has_facility / itap.retention_action_allowed
-- (1792365700213) describe the classes and must list every value here.
CREATE TABLE itap.retention_data_classes (value text PRIMARY KEY, description text);
INSERT INTO itap.retention_data_classes (value, description) VALUES
  ('detections', 'Face detections (camera recognition)'),
  ('locations', 'Identity area locations (tracking)'),
  ('sessions', 'Tracking sessions'),
  ('events', 'Events'),
  ('deliveries', 'Notification deliveries and inbox rows'),
  ('webhook_deliveries', 'Webhook deliveries'),
  ('incidents', 'Closed incidents with notes and activities'),
  ('photos', 'Identity photos of archived unknown identities'),
  ('embeddings_withdrawn', 'Embeddings after biometric consent was withdrawn'),
  ('unknown_identities', 'Unlinked camera identities'),
  ('auth_attempts', 'Face authentication sessions, attempts and replay digests'),
  ('auth_evidence', 'Face authentication evidence frames (auth_capture files)'),
  ('search_history', 'Search requests, results and search images'),
  ('bulk_jobs', 'Bulk jobs with their rows and files'),
  ('reports', 'Generated reports and their files'),
  ('access_decisions', 'Physical access decisions'),
  ('terminal_syncs', 'Terminal policy sync log'),
  ('stats', 'Aggregated statistics buckets'),
  ('audit', 'Audit log'),
  ('trigger_logs', 'Hasura event and cron delivery logs');

-- delete = rows removed; anonymize = rows kept, personal references and payload removed; archive = rows kept,
-- attached files / derived children removed (reports -> expired, bulk jobs without rows and files).
CREATE TABLE itap.retention_actions (value text PRIMARY KEY, description text);
INSERT INTO itap.retention_actions (value, description) VALUES
  ('delete', 'Delete the rows'),
  ('anonymize', 'Keep the rows, remove personal references and payload'),
  ('archive', 'Keep the rows, remove attached files and derived children');

CREATE TABLE itap.retention_run_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.retention_run_statuses (value, description) VALUES
  ('running', 'In progress (resumable)'),
  ('completed', 'Finished'),
  ('failed', 'Stopped with an error');

CREATE TABLE itap.dsr_types (value text PRIMARY KEY, description text);
INSERT INTO itap.dsr_types (value, description) VALUES
  ('access', 'Right of access (bundle)'),
  ('erasure', 'Right to erasure'),
  ('rectification', 'Right to rectification'),
  ('portability', 'Right to data portability (bundle)'),
  ('restriction', 'Right to restriction of processing');

CREATE TABLE itap.dsr_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.dsr_statuses (value, description) VALUES
  ('received', 'Received, not started'),
  ('in_progress', 'Being fulfilled'),
  ('completed', 'Fulfilled'),
  ('rejected', 'Rejected (see rejection_reason)');

CREATE TABLE itap.dpia_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.dpia_statuses (value, description) VALUES
  ('not_required', 'No DPIA required'),
  ('required', 'DPIA required, not started'),
  ('in_progress', 'DPIA in progress'),
  ('approved', 'DPIA approved');

-- GDPR Art. 6(1) legal bases.
CREATE TABLE itap.legal_bases (value text PRIMARY KEY, description text);
INSERT INTO itap.legal_bases (value, description) VALUES
  ('consent', 'Consent of the data subject'),
  ('contract', 'Performance of a contract'),
  ('legal_obligation', 'Legal obligation'),
  ('vital_interests', 'Vital interests'),
  ('public_task', 'Public task'),
  ('legitimate_interests', 'Legitimate interests');

CREATE TABLE itap.integration_kinds (value text PRIMARY KEY, description text);
INSERT INTO itap.integration_kinds (value, description) VALUES
  ('hr', 'HR system (profiles)'),
  ('erp', 'ERP (companies, cost centers)'),
  ('siem', 'SIEM (security events)'),
  ('bms', 'Building management system'),
  ('webhook', 'Generic webhook'),
  ('custom', 'Custom connector');

CREATE TABLE itap.integration_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.integration_statuses (value, description) VALUES
  ('active', 'Enabled'),
  ('paused', 'Disabled by an administrator'),
  ('error', 'Last sync failed (set by the system)');

CREATE TABLE itap.integration_directions (value text PRIMARY KEY, description text);
INSERT INTO itap.integration_directions (value, description) VALUES
  ('inbound', 'Data flows into ITAP'),
  ('outbound', 'Data flows out of ITAP'),
  ('both', 'Both directions');

-- Exports (tables: task 4).
CREATE TABLE itap.export_formats (value text PRIMARY KEY, description text);
INSERT INTO itap.export_formats (value, description) VALUES
  ('csv', 'Comma-separated values'),
  ('json', 'JSON document'),
  ('xlsx', 'Excel workbook');

CREATE TABLE itap.export_modes (value text PRIMARY KEY, description text);
INSERT INTO itap.export_modes (value, description) VALUES
  ('full', 'Every row'),
  ('incremental', 'Rows changed since the watermark');

CREATE TABLE itap.export_job_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.export_job_statuses (value, description) VALUES
  ('queued', 'Waiting'),
  ('running', 'Being generated (leased)'),
  ('completed', 'File generated'),
  ('failed', 'Failed (see error)');
