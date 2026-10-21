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

### G8. The handbook lists only resource and glossary scopes; no module or guide articles
- **Need:** one hand-written article per module (`src/modules/<module>/docs/<topic>.<locale>.md`),
  such as "Members and invitations", readable from the Help page.
- **Framework:** `docsFromGlob` takes the path segment before `/docs/` as the scope, so a module
  directory becomes the scope. `useDocumentedScopes` (`@burojs/react`), which `<DocBrowser>` lists,
  emits only `concept/<term>` scopes, registered resources and their enum variants. An article
  scope that is not a resource name (a module, `guide/<x>`, `page/<x>`) is never listed, though
  `DocSources` reserves `app`, `guide` and `page`. **[code]**
- **Workaround:** none needed yet. A module article must be filed under the resource it explains
  (the directory name or a re-keyed entry in `src/docs.ts`); `tests/docs-integrity.test.ts` fails on
  an article scope that names no registered resource.
- **Expected from a framework:** guide/page scopes listed by `<DocBrowser>` (with a title from the
  bundle), so an article about a workflow need not pretend to belong to one table.

### G9. Enum badge colours: seven fixed variants, no neutral or caution
- **Need:** status palettes with a neutral tone (revoked, inactive, deactivated) and a caution tone
  distinct from warning (an expired invitation).
- **Framework (0.6.0):** `EnumColor` is the closed tuple `default | secondary | destructive |
  outline | success | warning | info`, validated at registration. **[code]**
- **Workaround:** `secondary` stands for neutral, `warning` for caution
  (`src/enums/tenancy.ts`, `src/enums/places.ts`).
- **Expected from a framework:** semantic tones (`neutral`, `caution`) mapped to theme tokens, or an
  app-registered colour set.

### G10. Reads through `useList` (live query registry) never run auth recovery
- **Need:** an `auth` error on a read (expired or rejected token) goes through
  `AuthProvider.onError`, so `refreshed` replays the read and `logout` ends the session.
- **Framework (0.6.0):** `createDataRuntime` builds the live query registry over the lease
  (`createLiveQueryRegistry(() => lease)`), and the lease carries no `authController`; only
  `<AuthRuntimeProvider>`'s context copy has it. `useList`/`useOne` take their `queryFn` from that
  registry, so `executeQuery` sees `runtime.authController === undefined` and rethrows the `auth`
  error without calling `onError`. Measured: a stored session whose refresh token is rejected left
  the shell on screen with a failed facility list and no sign-out. **[run]**
- **Workaround:** `getToken()` renews the organization token before it expires (no expired token
  is sent in the normal case); `check()` refreshes an expired base token and clears a rejected
  session; `SessionWatch` (`src/app/session-watch.tsx`) rotates the data session
  (`forced-sign-out`) when the token store loses its session, so the guard sends the user to
  `/login`.
- **Expected from a framework:** the registry built over the runtime value that carries the auth
  controller (or the controller passed to `createDataRuntime`).

### G11. A flow's form check ignores the field type's own format
- **Need:** the `invite` flow refuses `not-an-email` in its `f.email` field before any request.
- **Framework (0.6.0):** `createFlowFormPort` (`@burojs/core/flows`, also what `runFlow` uses)
  validates each field as `type: 'unknown'` with only `required` and the field's `validate`; the
  zod schema `f.email()` builds (`z.string().email()`) is never run. Measured with `runFlow`: the
  flow submitted `not-an-email`. **[run]**
- **Workaround:** the email field restates its format as `validate` (the mutation's own zod
  schema, `src/modules/organization/invitations.ts`).
- **Expected from a framework:** the flow form port validates with the field's declared schema and
  format semantics, as the record form does.

### G12. `onUnknown.check` cannot see what the flow submitted
- **Need:** "Check again" for the `invite` flow when the answer of `invite_member` was lost: look
  for a pending invitation to the address just typed.
- **Framework (0.6.0):** `FlowUnknownCheckContext` carries `record`, `args`, `key`, `data` and
  `signal`, not the form values or the submitted input, so a resource-level flow that creates a
  row by a natural key has nothing to look it up by. Without a check, `checkApp` warns
  `flow.unknown-unhandled`. **[code]**
- **Workaround:** none: the warning is accepted in `tests/check-app.test.ts`. The token is shown
  once, so even a confirmed invitation would need revoking and re-inviting; the unknown screen
  tells the administrator to check the Invitations list.
- **Expected from a framework:** the submitted input (or the values) in the check context.
