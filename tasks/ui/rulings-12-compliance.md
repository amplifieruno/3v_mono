# Phase 12 rulings (from the SDD ledger)

- | T1–T2 | holds (T1) shown on DSR erasure preview (T2) | Ruling: T1 exports hold lookup; T2 uses it |
- | T1 | carry-over face_source sweep doc + identity article wording | clean |
- | T2 | processing activities DPIA file (dpia kind) | clean |
- | T3 | exports owner-only files | clean |
- | T4 | audit log diff view; system status probes | clean |
- | T5 | console-wide pass + tasks/ui/summary.md | depends on T1–T4 |
- | T1–T2 | holds (T1) shown on DSR erasure preview (T2) | Ruling: T1 exports hold lookup; T2 uses it |
- Task 1: fix round 1 done 4228d38 (1263 ok; gates clean). Ruling: no separate re-review — fixes precise and tested on the dev stack.
- Task 2: fix round 1 done b121d3c (1300 ok; gates clean; preview mirrors dsr_erase hold selection, fail closed). Ruling: no re-review — precise, tested on dev stack. Residual: merged-identity holds not followed in preview (stated).
- Task 4: implementer DONE_WITH_CONCERNS 32a36b0 + 31bf6cf (1341 ok dev; gates clean). G84 buro attempt record keeps unsalted SHA-256 of the Set secret request after a lost answer (tab lifetime) — Ruling: accept for demo, logged + pinned by test; needs buro fix — cost: same-origin script could brute-force a weak secret. G85 block prop 'action' refused. By filter current members only.
- Final fix wave a213b24: a lost Set secret answer stays unknown when a secret already existed; e2e cleanup scoped to the organization and run ids; deleted rows on the before side; nav split. Suite 1343/1344 (the failure came from a gate run without the admin secret leaving rows behind — cleaned up by hand, file then 3/3), e2e compliance 5/5, console smoke 1/1.
- Residue: dev workspaces 'Dev test A/B' (2026-10-22) remain; the seeded user's default workspace is 'Dev test B' instead of the seed's 'Lobby monitoring' — left for the owner to decide.
