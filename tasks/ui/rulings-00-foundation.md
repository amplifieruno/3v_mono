# Phase 0 rulings (from the SDD ledger)

- | T5 self | "revoke if data layer offers" | Ruling: implementer checks metadata; include only if a function/permission exists — cheap either way |
- Task 1: review spec ✅ quality approved. Important (plan interaction): orphanArticleScopes check rejects module-folder articles not named after a resource — Ruling: keep the check; Task 5 article lives under resource scope `organization_member` (folder or docs.ts key) — cost if wrong: one renamed file.
- Task 3: dispatched base 2a2dcdd, implementer aa6c77b468c1f5c69 (opus). Ruling: AUTH_BASE = '/auth/v1' (hasura-auth serves under /v1; proxy strips /auth) — cost if wrong: one constant.
- Task 5: dispatched base 957b41c, implementer a3a08ec23fe07995b (opus). Ruling: members article under resource scope organization_member.
- Task 6: implementer DONE 0b05e5b (83 unit, dev 7). Data-layer security finding: org_admin can upload sensitive kind (profile_document) to org bucket (hasura-storage 0.7.2 writes metadata after insert) — bd 3v_mono-ryj P1. Ruling: defer as a data-layer task (owner: defer critical items) — fix before people/documents phase 4 or at phase close; cost if wrong: forged sensitive-kind files in own org bucket meanwhile (dev only).
- Final: parked — prod frontend nginx may start before auth/storage (no depends_on/restart) — Ruling: fix in phase 1 Task 1 (add depends_on + restart) — cost if wrong: prod frontend may exit on cold start.
- Final: parked — two tabs refreshing with the same refresh token: loser gets 401 → store.clear() signs out both — Ruling: fix in phase 1 Task 1 (skip clear if stored refresh token changed since refresh began) — cost if wrong: occasional sign-out with two tabs open.
- Final: parked — summary deferred line "org switch rotates then replaces scope" stale — Ruling: fix in phase 1 Task 1 docs touch.
