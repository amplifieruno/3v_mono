# Phase 8 rulings (from the SDD ledger)

- | T1–T2 | T1 produces analytic blocks + src/blocks/charts; T2 renders dashboard widgets from them | Ruling: T1 blocks take explicit params (facility, period, query params) so T2 can pass widget.params; T2 adds the kind→block map |
- | T2–T3 | none shared beyond module index | clean |
- | T3 | carries notification_deliveries.report_id → relation (phase 6 module touched) | clean; T3 may edit notifications delivery resource |
- | T1 self | "identity timeline reuse" — reuse phase-4 itap identity-timeline block, no new one | clean |
- | T4 self | e2e + demo + summary | clean |
- | T1–T2 | T1 produces analytic blocks + src/blocks/charts; T2 renders dashboard widgets from them | Ruling: T1 blocks take explicit params (facility, period, query params) so T2 can pass widget.params; T2 adds the kind→block map |
- Task 1: review spec ✅ changes requested: I1 heatmap/segment-trend silent caps, I2 chart a11y. Fix round 1 (resume implementer): I1, I2, M3 midnight-DST zones, M4 widget map pairs, M6 unique figures. Ruling: M5 (no-facility on dashboards) → Task 2; M7 stale window, M8 1000 caps parked — cost: cosmetic.
- Task 2: fix round 1 done fff900f (828 unit ok, dev-stack skipped; lint/typecheck clean). Ruling: no re-review (small test-pinned minors) — cost: final review catches.
- Task 3: fix round 1 done 0b2dacd (migration 286 reports.requested_by_me) + 33578b2 (1030 ok; gates clean). Ruling: no separate re-review — fixes specified precisely and suite green — cost: final review catches.
- Final fix wave: be56ba0 + 1c79631 (suite 1033 ok, e2e notifications 8/8, analytics 5/5). Residuals: rule e2e window can shift by one event between read and dry run; inline createQueryDescriptor 'as never' casts remain (pagination typed via offsetPage). Dev-stack residue of ~85 Org A/B organizations filed in bd.
