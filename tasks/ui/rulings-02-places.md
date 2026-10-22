# Phase 2 rulings (from the SDD ledger)

- Task 2: minor → Ruling: fold into Task 3 dispatch: reword G18; add sub-areas relatedList via by-name handle; sr-only over-capacity; dev test comments. Cost if wrong: small scope creep in Task 3.
- Task 4: implementer DONE_WITH_CONCERNS 4fb2c50 (272 unit / dev ok). apply_facility_template never skips names → twice doubles the tree; UI warns on name clash. Ruling: keep UI warning; idempotent template apply is a deferred data-layer improvement (bd) — cost if wrong: duplicate areas if operator ignores warning. G20 flow form layout lacks record typing; values only from form.initial. bd 3v_mono-5t6 device link deferred to phase 3.
- Final: parked — dev-sessions.ts hard-codes org name duplicating NOVA_NAME — Ruling: carry into phase 3 Task 1 (import NOVA_NAME) — cost if wrong: silent fallback to login → rate limit.
- Final: parked — M5 new area/access point don't default facility from sidebar (G22) — Ruling: wait for buro — cost: one extra pick per create.
