-- Console support for "Add members" (segment_members.opened_now): the membership row was inserted by the current
-- transaction. add_segment_members answers every open manual membership of the ids it was given, including the ones
-- that were open before the call; within the call's answer (the same transaction) this field tells the rows it opened
-- (new members and pinned rule members) from the ones it left as they were. created_at is the inserting
-- transaction's now() (column default), so it equals now() only inside that transaction: always false on a later read.
CREATE FUNCTION itap.segment_member_opened_now(member_row itap.segment_members)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT member_row.created_at = now();
$$;
