# Phase 5 rulings (from the SDD ledger)

- Task 2: implementer DONE_WITH_CONCERNS 98565aa (552/617). Events list offset not cursor (G41 polling ignored on cursor) — Ruling: accept, polling matters more for events. Params editor = custom field (G43). Minimal incident resource added. Migration computed fields (additive). Test/replay deferred → bd.
- Final: parked — ~72 camera identities from today's recognition test runs left in dev DB (referenced by detections/events) — Ruling: keep, documented with a listing query; reseed (`pnpm seed --reset`) is the owner's call — cost: noise in identities lists.
- Final: parked — stricter dwell validator refuses stored non-minute values on edit; full backend suite not re-run after one-test fix — Ruling: accept (seeded values are whole minutes; fix ran scoped) — cost: low.
