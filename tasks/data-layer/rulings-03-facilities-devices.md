# Slice 3 rulings (from the SDD ledger)

- | T3 self | apply_facility_template "prefer SQL function directly" vs title "action" | Ruling: SQL mutation function exposed to org_admin, no backend action |
- Ruling: apply_facility_template is a volatile SQL function exposed as a Hasura mutation to org_admin (no backend action) — spec §8.0 placement (no external service) — cost: none.
- Task 1: Ruling: fold minors #2 (distinct points), #4 (floor plan image mime image/%), #5 (tests: no-org session, cross-org move/insert) into the fix round — cost: small.
- Task 3: Ruling: configurable cron tolerance (CronSpec.toleranceSeconds) folded into Task 4 — device_health_check uses toleranceSeconds 120 so outages don't replay hours of probes — cost: none.
- Task 6: complete (commits baca686..ffb5c81) — Ruling: carry-over code items reviewed with the slice final review (same reviewer seat) — cost: none.
- Ruling: fix wave = #1 + minors 3 (areas unknown parent raises), 4 (seed frame_rate NULL for cameras; no-stream camera health unknown), 5 (zero-padded floor names "Floor 02"; children of restricted Floor 24 at least restricted), 6 (conventions telemetry citation), 7 (summary notes heartbeat kept) — cost: small.
