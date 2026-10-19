-- Stage B evaluates watch lists as of the detection time: an entry counts only when it already existed then
-- (created_at <= p_at) and had not expired. A detection evaluated late (redelivery, seed replay) is not matched
-- against entries added afterwards. Everything else as in 1792365700007_create_watch_lists.
CREATE OR REPLACE FUNCTION itap.identity_watch_lists(p_organization_id uuid, p_identity_id uuid, p_at timestamp with time zone)
 RETURNS SETOF itap.watch_lists
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'itap'
AS $function$
  SELECT l.*
  FROM itap.watch_lists l
  WHERE l.organization_id = p_organization_id
    AND EXISTS (
      SELECT 1
      FROM itap.watch_list_entries e
      WHERE e.organization_id = l.organization_id AND e.watch_list_id = l.id
        AND e.created_at <= p_at
        AND (e.expires_at IS NULL OR e.expires_at > p_at)
        AND (
          e.identity_id = p_identity_id
          OR e.profile_id = (
            SELECT i.profile_id FROM itap.identities i
            WHERE i.organization_id = p_organization_id AND i.id = p_identity_id
          )
        )
    );
$function$;
