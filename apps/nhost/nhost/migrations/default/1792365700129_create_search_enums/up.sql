-- Search enums (spec §6.11): search kinds, request states and result match types.
CREATE TABLE itap.search_types (value text PRIMARY KEY, description text);
INSERT INTO itap.search_types (value, description) VALUES
  ('facial', 'Face similarity search with an image'),
  ('attribute', 'Attribute filters only (no image)'),
  ('combined', 'Face similarity search narrowed by attribute filters');

CREATE TABLE itap.search_statuses (value text PRIMARY KEY, description text);
INSERT INTO itap.search_statuses (value, description) VALUES
  ('queued', 'Recorded, not started'),
  ('running', 'Extracting the face / searching'),
  ('completed', 'Results stored'),
  ('failed', 'Failed (see error)');

CREATE TABLE itap.search_match_types (value text PRIMARY KEY, description text);
INSERT INTO itap.search_match_types (value, description) VALUES
  ('exact', 'Similarity at least threshold + 0.15 (attribute searches: every filter matched)'),
  ('partial', 'Similarity at least the threshold'),
  ('fuzzy', 'Similarity within 0.1 below the threshold (only when the request asks for fuzzy matches)');
