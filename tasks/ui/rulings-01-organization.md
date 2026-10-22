# Phase 1 rulings (from the SDD ledger)

- Task 1: implementer DONE_WITH_CONCERNS b491e26,0dad298 (131 unit / 141 dev). Ruling: recognition_threshold is a max distance → low (<0.35) means fewer matches; keep both low/high checks with accurate messages — cost if wrong: one message. Ruling: client ranges for columns without DB CHECK chosen by implementer (0.1–0.9 etc.) — accept, listed in summary — cost: a too-tight range. G14: server CHECK refusal arrives as forbidden permission-error, can't map to field.
- Final: parked — isTimezone refuses legacy zones Postgres accepts but ICU doesn't list (EST/CET) — Ruling: carry into phase 2 Task 1 (accept stored value that the server already holds; only refuse new non-listed picks) — cost if wrong: an old record can't be saved until zone changed.
- Final: parked — plan-01 validateWindows signature stale; emptyText/string-list noun English in code — Ruling: leave (docs nit; i18n pass later).
