-- Face authentication service enums (spec §6.16, SA_6, slice 9).
CREATE TABLE itap.client_application_platforms (value text PRIMARY KEY, description text);
INSERT INTO itap.client_application_platforms (value, description) VALUES
  ('web', 'Web application'),
  ('android', 'Android application'),
  ('ios', 'iOS application'),
  ('server', 'Server-to-server integration'),
  ('kiosk', 'Self-service kiosk or terminal');

CREATE TABLE itap.client_application_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.client_application_statuses (value, description) VALUES
  ('active', 'Requests are accepted'),
  ('suspended', 'Requests are refused; can be reactivated'),
  ('revoked', 'Permanently retired; terminal');

CREATE TABLE itap.auth_modes (value text PRIMARY KEY, description text);
INSERT INTO itap.auth_modes (value, description) VALUES
  ('identification', 'No identity claimed; the scoped population is searched'),
  ('verification', 'An identity is claimed; one comparison');

-- What an application may receive about the authenticated person (never the identity record).
CREATE TABLE itap.auth_attributes (value text PRIMARY KEY, description text);
INSERT INTO itap.auth_attributes (value, description) VALUES
  ('display_name', 'Display name of the linked profile'),
  ('photo', 'Primary photo of the identity'),
  ('profile_type', 'Profile type'),
  ('company', 'Company name'),
  ('department', 'Department'),
  ('employee_id', 'Employee id'),
  ('access_level', 'Profile access level'),
  ('segments', 'Names of the bound segments the person belongs to');

CREATE TABLE itap.auth_steps (value text PRIMARY KEY, description text);
INSERT INTO itap.auth_steps (value, description) VALUES
  ('initial', 'First capture of the session'),
  ('recapture', 'Repeated capture after a partial match or a quality failure (at most 2)'),
  ('second_factor', 'The application asserted a second factor after a partial match');

CREATE TABLE itap.auth_outcomes (value text PRIMARY KEY, description text);
INSERT INTO itap.auth_outcomes (value, description) VALUES
  ('success', 'Matched at or above the threshold in force'),
  ('partial_match', 'Best score in the partial band [threshold - 0.08, threshold)'),
  ('failure', 'No match, quality failure, attack or refused second factor');

CREATE TABLE itap.auth_review_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.auth_review_statuses (value, description) VALUES
  ('none', 'No manual review'),
  ('pending', 'Waiting for manual review'),
  ('approved', 'Reviewer confirmed the person'),
  ('rejected', 'Reviewer refused the person');

CREATE TABLE itap.auth_failure_reasons (value text PRIMARY KEY, description text);
INSERT INTO itap.auth_failure_reasons (value, description) VALUES
  ('no_face', 'No face in the capture'),
  ('multiple_faces', 'More than one face in the capture'),
  ('low_quality', 'Face too small or low detection score'),
  ('blur', 'Capture too blurred'),
  ('poor_lighting', 'Capture too dark or overexposed'),
  ('not_in_population', 'The claimed identity is outside the application''s population (reported as below_threshold)'),
  ('not_retrieved', 'No candidate retrieved by stage 1'),
  ('below_threshold', 'Best comparison score below the threshold'),
  ('liveness_failed', 'Liveness / presentation attack check failed'),
  ('attack_detected', 'Sequence refused by attack resistance (injection, replay)'),
  ('second_factor_failed', 'The application reported a failed second factor');

CREATE TABLE itap.auth_attack_outcomes (value text PRIMARY KEY, description text);
INSERT INTO itap.auth_attack_outcomes (value, description) VALUES
  ('passed', 'No attack indication'),
  ('printed_photo', 'Static sequence consistent with a printed photo'),
  ('screen_replay', 'Sequence consistent with a screen replay'),
  ('mask', 'Mask detected'),
  ('injection', 'Replayed sequence digest or missing / foreign session binding'),
  ('not_checked', 'Check not performed (e.g. masks)');

CREATE TABLE itap.auth_session_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.auth_session_statuses (value, description) VALUES
  ('open', 'Accepting captures'),
  ('succeeded', 'Closed with a confirmed person'),
  ('failed', 'Closed without a confirmed person'),
  ('review', 'Waiting for manual review'),
  ('expired', 'Not completed within its lifetime');
