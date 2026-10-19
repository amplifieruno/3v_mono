-- Bounded repetition (fix round 1, task 5): a repeating policy stops after max_cycles cycles (NULL = unbounded, as
-- before). Without repeat the policy ends after one pass whatever max_cycles says. next_escalation_step is unchanged
-- otherwise: escalation k = p_taken uses step (k mod n) in cycle (k div n).
ALTER TABLE itap.escalation_policies ADD COLUMN max_cycles integer,
  ADD CONSTRAINT escalation_policies_max_cycles_positive CHECK (max_cycles IS NULL OR max_cycles >= 1);

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
  WHERE s.idx = p_taken % s.n
    AND (p_taken < s.n OR (p.repeat AND (p.max_cycles IS NULL OR p_taken < s.n * p.max_cycles)));
$$;
