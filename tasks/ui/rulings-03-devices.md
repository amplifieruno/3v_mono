# Phase 3 rulings (from the SDD ledger)

- Task 1: review spec ✅ quality approved. Ruling: fold Minor 1 (secret() sensitive:true) into Task 2 — cheap hardening.
- Task 2: implementer DONE_WITH_CONCERNS d1098cc (314 unit, dev ok). Ruling (accept): health chart uses custom query deviceHealthSeries (24h folded to 96 points) instead of source.list (100 cap) — G25.
- Final: parked — minors (timeupdate race with waiting; confirmIfAsked 2s; wall empty-state wording; summary bullet placement) — Ruling: leave; cost: small test slowness.
- Final: parked — M3 health/event logs ignore facility picker (G27) — Ruling: wait for buro scope through relations — cost: operators see all facilities' samples.
