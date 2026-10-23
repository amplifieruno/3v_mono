# Phase 10 rulings (from the SDD ledger)

- | T1–T2 | T1 policy resource; T2 decisions link to policy | Ruling: T1 registers access_policy names in resource-names; T2 links |
- | T2–T3 | decisions link to overrides (T3) | Ruling: T2 registers a minimal read-only override resource if T3 not yet; T3 extends |
- | T1 self | M2M subjects/targets: buro 0.6 links read-only → junction relatedLists | clean |
- | T4 | second admin nova.admin@itap.demo for four-eyes e2e | check seed has it; else rule in T4 |
- | T1–T2 | T1 policy resource; T2 decisions link to policy | Ruling: T1 registers access_policy names in resource-names; T2 links |
- | T2–T3 | decisions link to overrides (T3) | Ruling: T2 registers a minimal read-only override resource if T3 not yet; T3 extends |
- Task 1: implementer DONE_WITH_CONCERNS c211091 (1131/1132, docs titles fixed, targeted 19/19; gates clean). Ruling: Approve disabled with four-eyes reason (buro rule) satisfies RF1 'not offered' — Global Constraint says 'rule with reason' — cost: button visible but inert. G73 simulate as sheet+block; submit/approve show version in form body (G35, avoids G72); dev test leaves audit/sync rows; version valid from 2099.
- Task 3: fix round 1 done 6a9b373 (1175/1175 dev; gates clean; lock_all end received <30 s). Ruling: no re-review (text/doc fixes + test, suite green).
- Final fix wave 68e1aaf + 0ecab28: e2e cleanup scoped by policy epoch / run ids / transaction (verified: no seeded rows deleted); seed users get display names (dev stack repaired by a targeted update of the 4 blank names, no reseed). Residue: access.spec.ts 312 lines.
