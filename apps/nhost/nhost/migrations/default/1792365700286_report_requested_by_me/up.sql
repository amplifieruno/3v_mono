-- Console support for reports: reports.requested_by_me (computed, session), whether the session user requested the
-- report (created_by). The console's "Mine" view lists it, and "Check again" after a lost answer of "New report"
-- looks only at the member's own reports.
CREATE FUNCTION itap.report_requested_by_me(report_row itap.reports, hasura_session json)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(report_row.created_by = itap.session_user_id(hasura_session), false);
$$;
