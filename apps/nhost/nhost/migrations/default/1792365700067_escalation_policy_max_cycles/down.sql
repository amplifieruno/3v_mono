CREATE OR REPLACE FUNCTION itap.next_escalation_step(p_organization uuid, p_policy uuid, p_taken integer)
RETURNS TABLE (step_id uuid, after_minutes integer, step_position integer, cycle integer)
LANGUAGE sql STABLE
SET search_path = pg_catalog, itap
AS $$
  SELECT s.id, s.after_minutes, s.idx::integer + 1, (p_taken / s.n)::integer
  FROM (
    SELECT st.id, st.after_minutes, row_number() OVER (ORDER BY st.step_no) - 1 AS idx, count(*) OVER () AS n
    FROM itap.escalation_policy_steps st
    WHERE st.organization_id = p_organization AND st.policy_id = p_policy
  ) s
  JOIN itap.escalation_policies p ON p.organization_id = p_organization AND p.id = p_policy
  WHERE s.idx = p_taken % s.n AND (p.repeat OR p_taken < s.n);
$$;

ALTER TABLE itap.escalation_policies DROP COLUMN max_cycles;
