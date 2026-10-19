-- Final review fix 5: a repeating escalation policy needs a bound (max_cycles); NULL max_cycles stays allowed without
-- repeat (one pass). Existing rows comply (the seed policy has max_cycles 3).
ALTER TABLE itap.escalation_policies
  ADD CONSTRAINT escalation_policies_repeat_bounded CHECK (NOT repeat OR max_cycles IS NOT NULL);
