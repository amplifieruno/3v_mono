# Phase 11 rulings (from the SDD ledger)

- | T1–T2 | T2 keys hang off T1 client app resource | Ruling: T1 registers resource names; T2 adds keys relatedList/flows |
- | T1–T3 | T3 sessions/attempts link to client app; tester picks app | clean |
- | T2 | secret shown once — reuse invitation-token block pattern (phase 0) | clean |
- | T3 | webcam block from phase 4; authenticate_face action; evidence auth_capture via open_file (sensitive kind) | clean |
- | T1–T2 | T2 keys hang off T1 client app resource | Ruling: T1 registers resource names; T2 adds keys relatedList/flows |
- Task 3: review spec ✅ quality approved; I1 tester frames uploaded as face_source (org-readable, no purge) → switch to 'search' kind (owner-only); minors 2–5. Ruling: fold I1 + minors into Task 4 (first commit) — cost: none, not yet shipped.
- Final review: fix wave: I1 tester frames never purged → backend queues frame ids into pending_file_deletions after decision; M1 review toast wording; M2 e2e frame cleanup scoped to the run's own frames. Ruling (M3): e2e seeds a pending partial match via seed-only itap.seed_auth_flow with the admin secret — a console session can never reach pending — accepted exception to 'admin secret only for cleanup' — cost: setup bypasses the console for that one case.
- Final fix wave c264dd9 + ad78345: tester probe frames queued into pending_file_deletions (reason auth_tester_frame) after validation, drained within 10 min; review toasts no longer claim an expired session closed; e2e frame cleanup scoped to the run's own uploads. Suite 1232 ok, backend 552 ok, e2e 6/6.
