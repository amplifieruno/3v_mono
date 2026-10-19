-- Report enums (spec §6.10) and the event type `report_generated` (emitted when a report completes, so notification
-- rules, subscriptions and webhook subscriptions can react; slice 7 task 2).
CREATE TABLE itap.report_types (value text PRIMARY KEY, description text);
INSERT INTO itap.report_types (value, description) VALUES
  ('flow', 'Movement between areas (area transitions)'),
  ('occupancy', 'Daily facility occupancy and visits'),
  ('heatmap', 'Area activity by hour of day'),
  ('behavior', 'Visit frequency, dwell and after-hours distribution'),
  ('attendance', 'Scheduled profiles present, late or absent per day'),
  ('segment', 'Segment membership per day'),
  ('compliance', 'Audit activity and consent status'),
  ('device_health', 'Device health samples and outages'),
  ('incident', 'One incident with its timeline');

CREATE TABLE itap.report_formats (value text PRIMARY KEY, description text);
INSERT INTO itap.report_formats (value, description) VALUES
  ('pdf', 'PDF document'),
  ('xlsx', 'Excel workbook'),
  ('csv', 'Comma-separated values'),
  ('json', 'JSON document');

CREATE TABLE itap.report_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.report_statuses (value, description) VALUES
  ('queued', 'Waiting to be generated'),
  ('generating', 'Being generated (leased by a handler)'),
  ('completed', 'File generated'),
  ('failed', 'Generation failed (see error); can be retried'),
  ('expired', 'File removed by retention');

CREATE TABLE itap.report_metric_types (value text PRIMARY KEY, description text);
INSERT INTO itap.report_metric_types (value, description) VALUES
  ('count', 'Count'),
  ('average', 'Average'),
  ('percentage', 'Percentage (0-100)'),
  ('rate', 'Rate per unit of time');

INSERT INTO itap.event_types (value, description) VALUES ('report_generated', 'Report generated');
