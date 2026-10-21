# buro framework gaps found while building the ITAP UI

What the ITAP console needed from buro (`@burojs/*` 0.6.0) and did not find, or found broken.
Each entry: what is missing, where it bit us, what we did instead, and how sure we are.

Checked against buro `origin/main` at the 0.6.0 release (`e8ff7ff`).

Evidence: **[run]** reproduced by running it; **[code]** read in the framework source, not run;
**[doc]** stated in buro's docs or `examples/marketplace-ops/docs/known-gaps.md`.

## Open

### G1. No Nhost auth adapter, no token refresh
- **Need:** sign in through Nhost auth, then a per-organization token (15 min TTL) issued by
  `switch_organization`; refresh both.
- **Framework:** `AuthProvider` contract only (`getIdentity`, `check`, `login`, `logout`, `onError`).
  No adapter, no token store, no refresh scheduler. The example's `onError` matches HTTP 401, but
  Hasura answers an expired JWT with HTTP 200 + `invalid-jwt`. **[code]**
- **Workaround:** our own `AuthProvider` + token store; `onError` matches `kind === 'auth'`.
- **Expected from a framework:** an Nhost (or generic OIDC/refresh-token) auth adapter, and a
  "secondary token" hook for tenant-scoped tokens.

### G2. `f.file` edit/create is not wired to the Hasura write path
- **Framework:** display maps the raw column through `mapper.read`; the input seeds only from
  `FileRef[]` (an existing uuid column starts empty) and nothing calls `mapper.write` on submit, so
  `FileRef[]` would reach a `uuid` column. Matches known gap `file-input-half-unwired`. **[code]**
- **Workaround:** to be decided after a spike (custom field implementation storing the file id).

### G3. Hasura live socket keeps the old token after an organization switch
- **Framework:** `connectionParams` are read once per socket; the live provider has no
  `dispose`/reconnect, and owned providers are rebuilt per rotation, leaking a socket each time. **[code]**
- **Workaround:** polling (`views.list.refetchInterval`) for live lists until fixed.

### G4. No `updateMany` / `deleteMany` in the Hasura provider
- **Framework:** bulk flows run row by row, at most 100 rows. Known gap `update-many-missing`. **[code]**
- **Workaround:** row-by-row bulk flows, or a custom mutation for set-based operations.

### G5. Many-to-many links are read-only
- **Framework (0.6.0):** `f.relationMany({ to, through: { resource, sourceKey, targetKey, where } })`
  declares a link over a junction: chips, `has/hasAny/hasAll/hasNone` filters, read-only link panels
  (`relatedList({ link })`). Links are not form inputs; attach/detach "come later". **[code]**
- **Workaround:** links for reading/filtering; edits through the junction resource (`relatedList` of
  the junction with create/delete) until link writes ship.

### G6. Context picker slices load nothing; scope lives in two places
- **Framework (0.6.0):** reads now honour a declared `data.scope` (`readScope`, sources
  `context|session|none`), which covers facility narrowing. Still: the `s.picker` slice loads no
  options and persists nothing, and rules read the resolver `scope` slice while queries read
  `dataSession.scopeKey`, so the app keeps them in step by hand. **[code]**
- **Workaround:** facility picker state in app code feeding `replaceScope` and the resolver slice.

### G7. Saved views and column layouts are per browser, not per user or tenant
- **Framework:** default `UiSettingsAdapter` is `localStorage` keyed by resource (F14). **[doc]**
- **Workaround:** pass our own `uiSettings` (user settings table) if needed.
