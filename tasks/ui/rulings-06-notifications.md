# Phase 6 rulings (from the SDD ledger)

- | T1–T2 | rules reference recipient groups, escalation policies (T2) | T1 shows them as relations; resources registered in T1 minimally or T2 first? Ruling: T1 registers minimal read-only recipient_group/escalation_policy resources if T2's don't exist yet; T2 extends them |
- Task 1: implementer DONE_WITH_CONCERNS 9cbef46 (702 dev). G49 links to enum values impossible; G50 conditions refusal not on node → editor validates itself. Incident escalation policy editable (metadata allows) — Ruling: keep editable (data layer permits; operators may change policy) — cost: small.
- Task 2: fix round 1 75042b2. Ruling: DB trigger (migration 280) clears max_cycles when repeat off — accepted (buro can't send null for hidden fields; server ignored the value anyway) — cost: one trigger.
- Final: parked — inactive test rule weakens the "test rule writes nothing" e2e guard (dev-stack test still asserts no writes on an active rule path) — Ruling: accept — cost: e2e alone wouldn't catch a dry-run that writes.
