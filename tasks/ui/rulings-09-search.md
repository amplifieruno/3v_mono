# Phase 9 rulings (from the SDD ledger)

- | T1–T2 | T1 search form/results block; T2 saved searches reuse the form fields and results block | Ruling: T1 exports the search params shape + results block for T2 |
- | T1–T3 | bulk_search kind (T3) shows results like T1 | Ruling: T3 reuses T1 results rendering for bulk_search rows |
- | T1 | webcam capture reuses phase-4 itap:webcam-capture block | clean |
- | T3 | storageFile field for bulk_input (owner-only) | clean |
- | T1–T2 | T1 search form/results block; T2 saved searches reuse the form fields and results block | Ruling: T1 exports the search params shape + results block for T2 |
- | T1–T3 | bulk_search kind (T3) shows results like T1 | Ruling: T3 reuses T1 results rendering for bulk_search rows |
- Task 1: review spec ✅ quality approved (minors). Ruling: minors 1–5 folded into Task 2 (readable definition summary fits saved searches) — cost: none.
- Task 2: review spec ✅ quality approved (minors). Ruling: minors 1,2,4,5 folded into Task 3; 3,6 parked — cost: none.
- Task 3: implementer DONE_WITH_CONCERNS bae134d (T2 minors) + 64ed7f9 (1104 ok; gates clean). Ruling: retry only failed/partly failed per plan Global Constraint though server also allows cancelled — cost: cancelled job not resumable from console. G70/G71. Poll job row ≤30 min.
- Task 3: review spec ✅ quality approved (minors). Ruling: minors 1–6 folded into Task 4; 7 consistent with ruling.
- Final fix wave 2bbe4df: G72 logged (confirm-only flows lose their toast in the browser; buro FlowRunner closes before then-effects). Search polling bounded to 2 min; CSV read-back via useQuery; searchRan judges only the newest run (safe direction). Dev-stack suites not re-run after the fix wave (unit 981 ok).
