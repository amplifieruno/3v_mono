CREATE TABLE itap.company_kinds (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.company_kinds (value, description) VALUES
  ('tenant', 'Tenant of the business center'),
  ('contractor_vendor', 'Contractor or vendor'),
  ('service_provider', 'Service provider'),
  ('visitor_org', 'Organization of visitors');

CREATE TABLE itap.company_statuses (
  value text PRIMARY KEY,
  description text
);
INSERT INTO itap.company_statuses (value, description) VALUES
  ('active', 'Active'),
  ('inactive', 'Inactive');
