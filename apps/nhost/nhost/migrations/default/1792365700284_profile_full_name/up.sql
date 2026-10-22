-- Console support for pickers and record titles (profiles.full_name): the person's first and last name joined by a
-- space, NULL when both are blank. Before this a profile picker showed the last name alone (tasks/ui/buro-gaps.md G29).
CREATE FUNCTION itap.profile_full_name(profile_row itap.profiles)
RETURNS text
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT nullif(btrim(concat_ws(' ', profile_row.first_name, profile_row.last_name)), '');
$$;
