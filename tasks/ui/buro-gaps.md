# buro framework gaps found while building the ITAP UI

What the ITAP console needed from buro (`@burojs/*` 0.6.0) and did not find, or found broken.
Each entry: what is missing, where it bit us, what we did instead, and how sure we are.

Checked against buro `origin/main` at the 0.6.0 release (`e8ff7ff`).

Evidence: **[run]** reproduced by running it; **[code]** read in the framework source, not run;
**[doc]** stated in buro's docs or `examples/marketplace-ops/docs/known-gaps.md`.

## Open

### G1. No Nhost auth adapter, no token refresh
- **buro answer (2026-10-22):** planned upstream (auth token lifecycle); a vendor adapter stays outside core.
- **Need:** sign in through Nhost auth, then a per-organization token (15 min TTL) issued by
  `switch_organization`; refresh both.
- **Framework:** `AuthProvider` contract only (`getIdentity`, `check`, `login`, `logout`, `onError`).
  No adapter, no token store, no refresh scheduler. The example's `onError` matches HTTP 401, but
  Hasura answers an expired JWT with HTTP 200 + `invalid-jwt`. **[code]**
  Phase 0 evidence **[run]**: our adapter written and exercised (`tests/integration/auth.dev.test.ts`, `e2e/auth.spec.ts`: sign-in, switch, rejected refresh ends in sign-out).
- **Workaround:** our own `AuthProvider` + token store; `onError` matches `kind === 'auth'`.
- **Expected from a framework:** an Nhost (or generic OIDC/refresh-token) auth adapter, and a
  "secondary token" hook for tenant-scoped tokens.

### G2. `f.file` edit/create is not wired to the Hasura write path
- **Status:** fixed upstream in PR #137 (REF-67, unreleased); thin local workaround in
  `src/fields/storage-file*`.
- **Framework (0.6.0):** display maps the raw column through `mapper.read`; the input seeds only from
  `FileRef[]` (an existing uuid column starts empty) and nothing calls `mapper.write` on submit, so
  `FileRef[]` would reach a `uuid` column. Matches known gap `file-input-half-unwired`. `withFileStorage`
  wraps the old provider shape (`create`/`update` with `args.variables`), not 0.6's
  `mutations.updateOne(descriptor)`. **[code]** Not reproduced by a run: the buro maintainer
  confirmed the gap and its fix (PR #137: the edit form seeds through `mapper.read`, submit writes
  `mapper.write(next, prev)`, an untouched file field is left out of the update).
- **Workaround:** one local field type, `storageFile(...)` (`uuid` column, `ui.input/display:
  'itap.storage-file'`), whose input uploads to hasura-storage and writes the file id, and whose
  display previews through the presigned URL (`open_file` for sensitive kinds). No provider wrapper.
  Replaced by `f.file` + `nhostFileStorage` once PR #137 ships.

### G3. Hasura live socket keeps the old token after an organization switch
- **Status:** fixed upstream in PR #139 (unreleased).
- **Framework:** `connectionParams` are read once per socket; the live provider has no
  `dispose`/reconnect, and owned providers are rebuilt per rotation, leaking a socket each time. **[code]**
- **Workaround:** polling (`views.list.refetchInterval`) for live lists until fixed.

### G4. No `updateMany` / `deleteMany` in the Hasura provider
- **buro answer (2026-10-22):** fixed on buro main (set-based updateMany/deleteMany via useUpdateMany/useDeleteMany; bulk flows still row by row), unreleased.
- **Framework:** bulk flows run row by row, at most 100 rows. Known gap `update-many-missing`. **[code]**
- **Workaround:** row-by-row bulk flows, or a custom mutation for set-based operations.

### G5. Many-to-many links are read-only
- **buro answer (2026-10-22):** fixed on buro main (many-to-many part 2: inline links in forms, Attach/Detach in panels), unreleased.
- **Framework (0.6.0):** `f.relationMany({ to, through: { resource, sourceKey, targetKey, where } })`
  declares a link over a junction: chips, `has/hasAny/hasAll/hasNone` filters, read-only link panels
  (`relatedList({ link })`). Links are not form inputs; attach/detach "come later". **[code]**
- **Workaround:** links for reading/filtering; edits through the junction resource (`relatedList` of
  the junction with create/delete) until link writes ship.
- **Phase 2:** the access point's Devices tab is a `relatedList` of the junction
  `access_point_device` (create seeded from its `where`, delete from the row menu; tested in
  `tests/modules/access-points-page.test.tsx`). The read link `f.relationMany({ to: 'device',
  through })` waits for the device resource (phase 3); until then a binding shows the device id.

### G6. Context picker slices load nothing; scope lives in two places
- **buro answer (2026-10-22):** planned upstream (next step of the scope model).
- **Framework (0.6.0):** reads now honour a declared `data.scope` (`readScope`, sources
  `context|session|none`), which covers facility narrowing. Still: the `s.picker` slice loads no
  options and persists nothing, and rules read the resolver `scope` slice while queries read
  `dataSession.scopeKey`, so the app keeps them in step by hand. **[code]**
- **Workaround:** facility picker state in app code feeding `replaceScope` and the resolver slice.

### G7. Saved views and column layouts are per browser, not per user or tenant
- **buro answer (2026-10-22):** answer: pass a `uiSettings` adapter backed by our own store — intended use, not a workaround.
- **Framework:** default `UiSettingsAdapter` is `localStorage` keyed by resource (F14). **[doc]**
- **Workaround:** pass our own `uiSettings` (user settings table) if needed.

### G8. The handbook lists only resource and glossary scopes; no module or guide articles
- **buro answer (2026-10-22):** open question upstream (listing); bundle titles done in a branch.
- **Need:** one hand-written article per module (`src/modules/<module>/docs/<topic>.<locale>.md`),
  such as "Members and invitations", readable from the Help page.
- **Framework:** `docsFromGlob` takes the path segment before `/docs/` as the scope, so a module
  directory becomes the scope. `useDocumentedScopes` (`@burojs/react`), which `<DocBrowser>` lists,
  emits only `concept/<term>` scopes, registered resources and their enum variants. An article
  scope that is not a resource name (a module, `guide/<x>`, `page/<x>`) is never listed, though
  `DocSources` reserves `app`, `guide` and `page`. **[code]**
  Phase 0 evidence **[run]**: the members article had to move under resource scope `organization_member` to be listed on Help (`e2e/foundation.spec.ts`, `tests/docs-integrity.test.ts`).
- **Workaround:** none needed yet. A module article must be filed under the resource it explains:
  `src/modules/<module>/docs/<resource-scope>/<topic>.<locale>.md`, read by the app's own
  `articleSources` (`src/docs.ts`) instead of `docsFromGlob`; `tests/docs-integrity.test.ts` fails on
  an article scope that names no registered resource.
- **Expected from a framework:** guide/page scopes listed by `<DocBrowser>` (with a title from the
  bundle), so an article about a workflow need not pretend to belong to one table.

### G9. Enum badge colours: seven fixed variants, no neutral or caution
- **buro answer (2026-10-22):** open question upstream.
- **Need:** status palettes with a neutral tone (revoked, inactive, deactivated) and a caution tone
  distinct from warning (an expired invitation).
- **Framework (0.6.0):** `EnumColor` is the closed tuple `default | secondary | destructive |
  outline | success | warning | info`, validated at registration. **[code]**
  Phase 0 evidence **[run]**: enums registered with these colours pass `checkApp` and render as badges in the invitations list.
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
- **Status:** fixed upstream in PR #147 (merged, unreleased); the `SessionWatch` workaround stays
  until the next buro release.

### G11. A flow's form check ignores the field type's own format
- **buro answer (2026-10-22):** planned upstream (builder fields lower to canonical constraints); canonical declarations already validated on main.
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
- **buro answer (2026-10-22):** open question upstream.
- **Need:** "Check again" for the `invite` flow when the answer of `invite_member` was lost: look
  for a pending invitation to the address just typed.
- **Framework (0.6.0):** `FlowUnknownCheckContext` carries `record`, `args`, `key`, `data` and
  `signal`, not the form values or the submitted input, so a resource-level flow that creates a
  row by a natural key has nothing to look it up by. Without a check, `checkApp` warns
  `flow.unknown-unhandled`. **[code]**
  Phase 0 evidence **[run]**: `checkApp` reports the warning for `invite` (accepted in `tests/check-app.test.ts`).
- **Workaround:** none: the warning is accepted in `tests/check-app.test.ts`. The token is shown
  once, so even a confirmed invitation would need revoking and re-inviting; the unknown screen
  tells the administrator to check the Invitations list.
- **Also (phase 2):** the facility's `apply_template` flow: a lost answer of
  `apply_facility_template` cannot be checked (the chosen template and parent are not in the
  context), and a resend would create every area again; accepted the same way.
- **Also (phase 4):** `merge_into` (Merge into this identity) works around it: its `submit.input`
  function remembers the first identity it sends, by the kept identity's id, in a module-level map,
  and the check reads that identity back (`merged` = applied). Unknown after a reload of the console.
- **Expected from a framework:** the submitted input (or the values) in the check context.

### G13. No current-record screen: a one-row resource needs a custom page
- **buro answer (2026-10-22):** open question upstream.
- **Need:** "Organization" in the sidebar opens the current organization (the id the organization
  token is scoped to) in show mode, with Edit.
- **Framework (0.6.0):** `ResourceConfig.singleton`/`recordId` were removed on purpose
  (`docs/lists-guide.md` "One-row screens"): a constant id is wrong per tenant. The recommended
  shapes are a list the server narrows to one row (here: a list page with one row, one click more)
  or `defineCustomPage` plus your own read. No resource-level "current record from the identity /
  scope" option, though here the id is known on the client (`identity.organizationId`). **[code]**
  Phase 0 evidence **[run]**: custom page built and exercised (`tests/modules/organization-profile.test.tsx`, `e2e/foundation.spec.ts`: Save lands on the resource route).
- **Workaround:** custom page `organization-profile` whose block `itap:organization-profile`
  (`src/modules/organization/organization-profile-view.tsx`) renders `<RecordScreen mode="show"
  recordId={identity.organizationId}>`. Edit and Save use the resource's own routes
  (`/organization/:id/edit`, then its show route), so after a save the user is on the resource's
  show route, not on the page.
- **Expected from a framework:** a resource view whose record id is a function of the session
  (identity or scope), with its show/edit routes at the resource's base path.

### G14. A record form's number range is not enforced, and a server refusal never reaches a field
- **buro answer (2026-10-22):** client half planned (builder constraints), server half planned (one result/error model; refusal lands on its field).
- **Need:** a settings value outside the database's CHECK range is refused on its field, with the
  range in the message; a refusal by the server still lands on the field it concerns.
- **Framework (0.6.0):** the record form validates each active field with `type: 'unknown'` and
  only `required` plus the field's own `validate` (`runValidation`,
  `@burojs/react/src/forms/controller/pipeline.ts`): the `min`/`max`/`integer` of `f.number` (and
  its zod schema) are never run, so an out-of-range number reaches the server. The framework's own
  `number.minimum`/`number.maximum` texts ("Value is too small/large") do not name the range
  either. On save, `<RecordScreen>` shows any failure as one form-level alert
  (`frame-pieces.tsx` `failureText`); `normalizeServerRecordIssues` is used by flows only. The
  Hasura provider maps `constraint-violation` to `conflict` and `permission-error` to `forbidden`,
  neither with a field. Measured on the dev stack: Hasura answers an `org_admin` CHECK violation
  with `permission-error` (not `constraint-violation`), so the provider reports `forbidden`; the
  alert reads "Validation failed" (its friendly match on the message). **[run]**
  Evidence: `tests/integration/organization-settings.dev.test.ts`,
  `tests/modules/organization-settings-page.test.tsx`.
- **Workaround:** `boundedNumber` (`src/fields/bounded-number.ts`) restates the range as
  `validate` with a message naming it ("Enter a whole number from 10 to 3600."); ranges mirror the
  CHECK constraints (`SETTINGS_RANGES`), so the server refusal is a backstop only.
- **Expected from a framework:** the record form runs the field's declared constraints, with
  range-aware default messages; a provider hook mapping a server refusal (constraint name) to a
  field issue, rendered on the field as flows already do.

### G15. The list search box names only the first search field
- **buro answer (2026-10-22):** open question upstream.
- **Need:** the companies list searches name, contact email and cost center; the box should say so.
- **Framework (0.6.0):** `filter-region.tsx` builds the placeholder from the first visible field of
  `views.list.search.fields` only ("Search by Name…"); a resolver gets the generic "Search". There
  is no per-list placeholder text. **[run]** seen in the browser on `/companies`.
- **Workaround:** none in code; the companies article says what the search box looks in.
- **Expected from a framework:** a placeholder naming every searched field ("Search by name,
  contact email, cost center…") or a `texts` slot for the list's search placeholder.

### G16. A current-record screen has no heading of its own
- **buro answer (2026-10-22):** answer: a record frame without `<RecordTitle/>` lets the page draw its own heading — adopt in phase 4 Task 0b.
- **Status (phase 4 Task 0b): resolved by the 0.6 pattern.** Frame `itap:current-record`
  (`src/app/current-record-frame.ts`, view `current-record-frame-view.tsx`, registered with
  `use('frames', …)` and `<BuroProvider frameImplementations>`): the built-in record frame without
  `<RecordTitle/>` / `<CopyId/>`; in show mode it keeps the item actions (Edit) and the `header`
  slot, in edit/create the form opens directly under the page heading. Used by the organization
  profile, organization settings and preferences pages (`RecordScreen frame={currentRecordFrame}`);
  `userSettings.recordTitle` is gone. Tested in `tests/modules/preferences-page.test.tsx`,
  `organization-profile.test.tsx`, `organization-settings-page.test.tsx` (h1 = page title, no
  record heading, no Copy ID). The text below is the history. The view-kind half (G13: a record id
  from the identity or scope) stays open upstream.
- **Need:** the "My preferences" page shows the signed-in user's `user_settings` row as a form;
  the record has no name, so its heading should be the page's ("My preferences") or none.
- **Framework (0.6.0):** `<RecordScreen>` always draws the record title from `recordTitle(record)`
  → `record[displayField]` → `#<id>`, plus the copyable id; the default display field is the first
  non-system string field, so the heading read `de` (the language code). There is no prop to hide
  or replace the heading, and `recordTitle` has no translation context for a fixed text. **[run]**
  seen in the browser on `/preferences`.
- **Workaround:** `userSettings.recordTitle` composes the values themselves (`de · Europe/Berlin`,
  `—` for an empty one), so the heading is data, not an English literal.
- **Expected from a framework:** a `title`/`hideTitle` prop on `<RecordScreen>` (or the G13
  current-record view kind with the page title as heading).

### G17. A field validator cannot read what its input loaded, nor the stored value
- **buro answer (2026-10-22):** answer: resource-level async `validate(values, ctx)` (ctx.view, initialValues, dirty, signal) blocks Save — adopt in phase 4 Task 0b; reusable per-field form is an open question.
- **Status (phase 4 Task 0b): checked against the 0.6.0 source, not adopted; the registry stays.**
  What a resource `validate` gets (`react/src/forms/controller/pipeline.ts`
  `ResourceValidateContext`): `values`, `resource`, `view`, `signal`, `dirty`, `initialValues`.
  Three findings for the buro team:
  1. **No data access.** Nothing in the context reaches the data runtime, the provider or the
     query cache, and `defineQuery` has no imperative call outside React. The runtime is per
     mount and rotates with the data session (organization switch), so reading the definitions
     from a validator needs a module-level handle to the current runtime published by
     `<AppRuntime>` — the same hand-wiring as today's snapshot registry, plus a second read of
     what the input already loaded, outside the session's scope key. The sample's
     `checkCustomFields(values.custom_fields, ctx.signal)` presumes such a fetch.
  2. **`ctx.dirty` is not "changed".** It is "touched or a submit happened": on a submit
     `use-form-controller.ts` marks every active field dirty before calling `validate`, so
     `ctx.view === 'edit' && !ctx.dirty.custom_fields ? {} : …` never skips on Save. The skip the
     trigger makes (unchanged value) needs `sameJson(values.custom_fields,
     ctx.initialValues.custom_fields)`.
  3. **Per resource, and a map result loses the code.** Each resource with `customFields` would
     wire its `validate` (facility, device now; profile, identity in phase 4), composing with any
     other cross-field rule; a returned `{ field: string }` map becomes `resource.invalid` with the
     text as default, so the `validation.itap.customFields.*` keys survive only by returning
     canonical `ValidationIssue`s.
  The field-level validator already blocks Save and needs no per-resource wiring; with the stored
  value read from the input's `record` it is equivalent to the resource form on the record screens
  (the only place either runs). Kept as is. Wanted: a validator context with a data reader
  (`ctx.read(resource, query)` / `ctx.query(defineQuery…)`) on the field or resource validator,
  and a `changed` map beside `dirty`. The same holds for `plan-size-registry.ts` (G19 related).
- **Need:** the reusable `customFields({ entity })` field checks a record's `custom_fields` against
  the organization's attribute definitions (required ones, value types) before any request, and,
  like the database trigger, skips the check on an edit that leaves the value unchanged.
- **Framework (0.6.0):** a field `validate` receives `(value, { values, field })` only
  (`validation-runner.ts`): no data provider, no query cache, no record being edited, no mode. The
  input reads the definitions (`useList`) and sees `record`, but has no way to contribute issues;
  only a resource-level `validate` sees `initialValues` and `view`, which would make every resource
  using the field wire it by hand. **[code]**
- **Workaround:** the input publishes `{ definitions, stored }` per entity while mounted
  (`src/fields/custom-fields-registry.ts`); the field's validator reads it on save and checks only
  the shape when nothing is published (the server decides). Tested in
  `tests/fields/custom-fields.test.ts` and `tests/modules/facilities-page.test.tsx`.
- **Expected from a framework:** a validator context carrying the record being edited (or initial
  values) and a way for a field implementation to declare an async validator with access to the
  data runtime, or to report issues from its input.

### G18. A form check cannot test the chosen value against a list read for it
- **buro answer (2026-10-22):** answer as G17 (resource-level async validate); declarative values-keyed source is an open question.
- **Status (phase 4 Task 0b):** unchanged; the resource `validate` has no data access (G17 finding
  1), so it cannot read the chosen parent's `path` without hand-wiring either.
- **Need:** the area form refuses, on the "Inside" field and before any request, a parent that
  is the area itself or one of its own sub-areas (the database refuses it with `area_cycle`):
  the check must compare the chosen parent's `path` with the edited area's id.
- **Framework (0.6.0):** on the `create`/`edit` surfaces a check's `CheckDI` has `values` and
  `saved`, which hold only the fields the user may edit (`id`, `path` and other system fields are
  dropped from the form state), and `record` is populated on the action and delete surfaces only
  (`docs/checks-guide.md` §5). The edited id itself is reachable: a `with` source keyed by
  `ref('route', 'id')` (the edit route's record id) can expose it, and the area's own row with it,
  to a portable check. The real limits are elsewhere: a `with` source may not be keyed by `values`
  (`source.values-input`), so nothing can read the chosen parent's row (its `path`) as the user
  picks it, and the portable grammar has no membership operator against a list or array (`in`
  takes literals only; the Hasura provider offers no array `contains` either). A relation's
  `candidates` cannot exclude a subtree for the same reason. A server refusal never reaches the
  field (G14): Hasura answers the trigger's `check_violation` as `permission-error` "Check
  constraint violation. area_cycle", the form shows its generic alert. **[run]**
  (`tests/integration/areas.dev.test.ts`; message measured with a direct `org_admin` request).
- **Workaround:** block `itap:area-parent-guard` (`src/modules/places/area-parent-guard-*`)
  placed under the field in the area form: its props default to `ref('record', 'id')` and
  `ref('values', 'parent_id')`, it reads the chosen parent and says at once when its path holds
  the area. It does not block Save; the database guard refuses the write. Tested in
  `tests/modules/areas-page.test.tsx`.
- **Expected from a framework:** a source keyed by form values (debounced) or a membership
  operator (`contains` on an array field, `in` against a source list) in the portable grammar and
  the Hasura provider, or a check `anchor` result fed from a server refusal (G14).

### G19. A field input cannot set another field of the form
- **buro answer (2026-10-22):** answer: `useFormControl().setValues` from @burojs/ui-shadcn on record screens (undocumented; null in flow forms) — adopt in phase 4 Task 0b.
- **Status (phase 4 Task 0b): checked, not adopted; `imageSize()` stays.** `useFormControl()` is
  real in 0.6.0 (`ui-shadcn/src/resource/form-context.tsx`, provided by `<RecordScreen>` only).
  Moving the fill into the image input would (a) need a plan-only wrapper of the generic
  `storageFile()` input (the organization logo uses it too) that decodes the image on upload;
  (b) cover only the create path: on an edit the sizes are required and set, a replaced image must
  *offer* its size, not overwrite it (areas and positions are in plan pixels), and an image
  without a size of its own (SVG) needs the note at the size field; both live in the size input
  and need the image there anyway. So `setValues` would add a second path without removing one.
  Kept; `setValues` stays the answer for a future input that really derives siblings on a record
  screen (with a fallback for flow forms, where it is `null`).
- **Need:** a floor plan's `width_px` / `height_px` are filled from the uploaded image when empty;
  the upload happens in the `image_file_id` input.
- **Framework (0.6.0):** a field input gets `onChange` for its own value only; `form` (the live
  values) is read-only, and no block or hook placed in a form can write values (no `setValue` in
  the form context). **[code]** (`packages/react/src/fields/types.ts`, `forms/controller`).
- **Workaround:** each size field has its own input (`imageSize({ axis, imageField })`,
  `src/fields/image-size*.ts`) that reads the image named by `form[imageField]`, loads its natural
  size and writes its own value when empty, or offers to take the image's size when it differs.
  Tested in `tests/modules/floor-plans-page.test.tsx`.
- **Expected from a framework:** a declared derivation (`derive: { from: ['image_file_id'], ... }`)
  or a form-scoped `setValue` for a field implementation.
- **Related (G17 again):** the plan-space fields (`areaShape()`, `planPosition()`) keep points on
  the floor-plan image; the size comes from the plan the input resolved, so the input publishes it
  per field channel (`src/fields/plan-size-registry.ts`) for the validator.
- **Related (handles by name):** `src/data/resource-by-name.ts` casts `{ kind: 'resource', ref: name }`
  to a `RelationTarget` so a resource can place a block or related list that reads itself (or a
  resource importing it) without an import cycle. It relies on buro internals reading only `kind`
  and `ref` of a handle (`handleRef` in `blocks/schemas.ts` / `screens/builder.ts`, `targetRef` in
  `screens/sources.ts`); a buro change there breaks it at `defineResource` time (covered by
  `checkApp` and the area / floor plan screen tests). Expected: a public by-name target
  (`resourceRef('area')`) for sources and related lists.

### G20. A flow form's layout is typed as a create screen, and its values start absent
- **buro answer (2026-10-22):** confirmed upstream bugs (flow field defaults, record-typed flow layouts, checker) — fix pending.
- **Need:** the facility's "Apply template" form places a preview block (`itap:template-overlap`)
  that reads the flow's record (the facility id) and the chosen values (template, parent area).
- **Framework (0.6.0):** at runtime a flow form's sources include `record` (the record the flow
  runs on, `useFlowForm` `metaSources`) beside `values`, but the form body's `Layout` is typed
  as a `create` screen (`BuiltinSource<'create'>` has no `record`), so `l.ref('record', 'id')`
  is a type error, and the checker refuses a block prop *defaulting* to `ref('record', …)` in
  that mode (`block.prop-source-missing`). Separately, a flow's values hold only `form.initial`
  (field `default`s are not applied), so a `ref('values', f)` prop default of an untouched field
  resolves to nothing and the placement fails ("the required prop … has no value"); a prop
  cannot be both `.optional()` and `.default(ref)`. **[run]**
  (`tests/modules/access-points-page.test.tsx`).
- **Workaround:** the placement sets `facilityId: ref('record', 'id')` cast to
  `ScreenRef<'record'>` (`src/modules/places/apply-template-flow.ts`), and `form.initial` gives
  both fields a literal `null` (`{ kind: 'literal', value: null }`). Tested through the UI in
  `tests/modules/access-points-page.test.tsx` (preview, warning, submit, notification).
- **Expected from a framework:** a flow form layout typed with the flow's sources (`record` for
  an item flow, `args`), and field `default`s seeding a flow's values, or `.optional()` allowed
  with a ref default (missing = `undefined`).

### G21. A relation field cannot choose the read scope of its options
- **buro answer (2026-10-22):** fixed on buro main (`f.relation({ scope })`), unreleased — then drop `inRecordScope()`.
- **Need:** the facility's "Apply template" form offers the facility's own areas for "Inside",
  whatever facility the sidebar picker holds.
- **Framework (0.6.0):** the relation select reads its options with scope `'context'`: the
  nearest record frame that carries the target's scope key, then the session selection. A flow
  form on a facility carries no frame for `area` (the facility has no `facility_id`; the facility
  `RecordScreen` adds no frame because `facility` declares no `data.scope`), so the sidebar
  facility narrows the options on top of the field's `candidates` (`facility_id = record.id`):
  with the sidebar on another facility the select offered nothing. `scope` is a prop of
  `RelationPicker` for custom implementations only; `f.relation` has no option for it. **[run]**
- **Workaround:** `inRecordScope(f.relation(...), { resource, field, value })`
  (`src/fields/record-scoped-relation*.ts(x)`): an input id whose implementation wraps the kit's
  relation input in `<RecordScopeProvider resource values={{ [field]: value }}>`, the value a
  meta ref (`ref('record', 'id')`). Tested in `tests/modules/apply-template-picker.test.tsx`.
- **Expected from a framework:** `f.relation({ scope: 'none' | 'session' | 'context' })`, or a
  flow form that provides a frame from its `candidates` refs.

### G22. A create form cannot default a field from the scope selection
- **buro answer (2026-10-22):** open question upstream (scope/user default refs).
- **Need:** a new area, floor plan or access point starts in the facility the sidebar picker
  holds (`facility_id` = the selection), as the area tree's "+" already does through its link.
- **Framework (0.6.0):** a create form seeds from a field's static `default`, a record type's
  `defaults`, the URL prefill and the caller's `defaults` (`<RecordScreen defaults>`), in that
  order. A function default is dropped with a warning (`fieldDefaults`, `record-values.ts`),
  a ref (`ref('scope', 'facility')`) is not read as a default, and the list's Create button
  builds its link without a prefill. The framework's routes render the create screen, so the
  console passes no `defaults`. **[code]**
- **Workaround:** none; the facility is picked in the form. The area tree's "+" links pass
  `?prefill.facility_id=` (and the parent), so adding from a facility page starts filled.
- **Expected from a framework:** a field default read from a source (`default: ref('scope',
  'facility')`), or a resource-level create seed from the context.

### G23. A flow's notification cannot choose a count form
- **buro answer (2026-10-22):** planned upstream (count params).
- **Need:** "Template applied: 1 area created" vs "5 areas created".
- **Framework (0.6.0):** `then.notify` is `true` or `{ params }`; the sentence is the flow's
  `texts.notify` with the params interpolated. A `count` inside `params` only interpolates
  `{{count}}`; a count family (`_one` / `_other`) is selected only by a top-level `count`, which
  the flow machine never passes (`flows/machine.ts`, i18n guide "Counts"). **[code]**
- **Workaround:** the apply-template sentence is count-neutral ("Areas created: 1, at the top
  level: 1 (Lobby).").
- **Expected from a framework:** `then.notify: { params, count: ref('result', 'created') }`.
- **Phase 7 Task 4:** the segment membership flows say the counts in count-neutral sentences
  ("Added by hand: 1. Already added by hand before (left as they were): 0.", "Memberships ended:
  0. 0 means it had already ended and nothing was changed."): a zero case cannot pick its own
  sentence either.


### G24. No write-only field (a column the role may write but never select)
- **buro answer (2026-10-22):** answer: leaving the column out of selectFields + undefined-when-untouched input is the intended pattern (keep out of jsonbSpill); portable writeOnly planned.
- **Need:** `devices.password`: writable by `org_admin`, never selectable; an edit form shows an
  empty "new password" box and sends the column only when something is typed (plan 03 Review
  Focus 3).
- **Framework (0.6.0):** every declared field is selected (the Hasura mapping's `selectFields`
  also make the mutation's returning set), and an edit payload carries every active field whose
  value is not `undefined` (`buildPayload`, `forms/controller/payload.ts`), dirty or not. There
  is no field option for "not read, sent only when entered"; `sensitive` only redacts audit
  events. **[code]**
- **Workaround:** `secret()` (`src/fields/secret*.ts(x)`): a nullable string with `in:
  ['create', 'edit']`, `meta.writeOnly`, an input that reports an empty box as `undefined` (which
  the payload omits), and `selectFieldsOf` leaving write-only fields out of the mapping. Tested in
  `tests/modules/devices-page.test.tsx` (no select names it; an untouched or cleared box is not
  sent; a typed one is).
- **Expected from a framework:** `f.string({ writeOnly: true })` (or `read: 'never'`): never
  selected, absent from show and list, and in a payload only when the user entered a value.

### G25. A block's `source.list` reads at most 100 rows
- **buro answer (2026-10-22):** answer: `source.query(defineQuery(...))` is intended for datasets; series source is an open question.
- **Need:** the device health chart (`itap:health-chart`, plan 03 Task 2) draws one device's
  last 24 h; the health check writes one sample per camera per minute (1440 a day).
- **Framework (0.6.0):** `source.list` takes `limit` 1 to 100 (`LIST_SOURCE_MAX_LIMIT`,
  `source.limit-range`) and has no paging or aggregation of its own. **[code]**
- **Workaround:** a custom query (`deviceHealthSeries`, `src/blocks/health-chart/
  health-series-query.ts`) reads the window straight from `device_health_metrics` (limit 2000,
  window start computed in `variables` so the cached input stays the device id) and folds it into
  15-minute points in `mapResult`; the block reads it with `source.query`. `reads` names the
  health-sample resource so a refresh of the logs refreshes the chart.
- **Expected from a framework:** a series source (`source.list` with a larger cap for blocks
  that draw rather than list, or a provider-side bucketed read such as
  `source.series(target, { where, x, bucket, measures })`).

### G26. A `source.list` condition cannot take a list value (`in` over literals)
- **buro answer (2026-10-22):** confirmed upstream: `in`/`nin` value will accept a list of literals.
- **Need:** the live wall (`itap:live-wall`, plan 03 Task 3) lists the cameras with recognition
  on; the natural read also narrows by `device_type in [static_video_camera, ptz_camera,
  thermal_camera]`.
- **Framework (0.6.0):** a `where` value of `source.list` (and `related-list`) is a
  `ScreenLiteral | PortableFieldRef`, and `ScreenLiteral` is `string | number | boolean | null`:
  an array is a type error, so the `in` / `nin` operators the list filters support cannot be
  used from a block or a related list. **[code]**
- **Workaround:** the condition is left out (only cameras can have recognition on: the start
  action refuses other devices).
- **Expected from a framework:** list literals (`readonly ScreenLiteral[]`) for `in` / `nin`
  conditions.

### G27. `data.scope` cannot narrow through a relation
- **Need:** the device health samples and device events (`device_health_metric`, `device_event`,
  plan 03) have no `facility_id` of their own; their facility is the device's. The sidebar
  facility picker should narrow them as it narrows devices.
- **Framework (0.6.0):** `data.scope.<key>.field` must name a declared field of the resource
  (`assertResourceScopeMapping`, `packages/core/src/data/read-scope.ts`), and `@burojs/hasura`
  turns a dimension into a flat `{ [field]: { _eq | _in } }` (`readScopeToWhere`); the legacy
  `scopeFields` / `getScope` pair is flat `_eq` too. A dotted path (`device.facility_id`) is
  refused at definition and would not be a valid Hasura `where` anyway. **[code]**
- **Workaround:** none; both lists show every facility's rows and say so in their articles
  ("Facility filter"). The device page's Health and Events tabs show one device's rows.
- **Expected from a framework:** a scope dimension over a relation path
  (`scope: { facility: { field: 'facility_id', via: 'device' } }`), translated by the Hasura
  provider into a nested `where` (`{ device: { facility_id: { _in } } }`).

### G28. A saved view cannot hold a relative date
- **Need:** the profile list's "Visitors today" view (plan 04 Task 1): visitors whose start date
  is on or before today and whose end date is on or after it.
- **Framework (0.6.0):** `views.list.savedViews[].state.filters` are static data, and a filter
  value is a literal (`FILTER_PREDICATE_OPS` has no relative-date operator, no `today` token).
  **[code]**
- **Workaround:** `profileSavedViews(now)` (`src/modules/people/profile-views.ts`) writes the
  day the console was loaded; the view goes stale past midnight until a reload (the article says
  so).
- **Also (Task 5):** the visit list's "Today" and "Expected now" (`visitSavedViews(now)`,
  `src/modules/people/visit-views.ts`) carry the load day and the load moment; "Expected now" is
  the one that ages fastest (a visit due an hour after loading is missing until a reload).
- **Expected from a framework:** relative date values in filters (`{ op: 'lte', value: { relative:
  'today' } }`), resolved when the view is applied.

### G29. A relation's label is one field; a person's name is two
- **Status:** pickers closed by a data-layer computed field; framework wish stands.
- **Need:** profiles are named by first and last name; relation pickers and relation cells of later
  resources (visits' visitor and host, identities' profile) should show both.
- **Framework (0.6.0):** `recordTitle` builds the page heading and breadcrumb, but relation labels
  and pickers read `displayField` only (one field name). **[code]** (`types/resource.ts`
  `displayField` doc).
- **Workaround:** until phase 7, `displayField: 'last_name'` plus `recordTitle` (first and last
  name); pickers showed the last name only. Phase 7 final wave: the computed field
  `profiles.full_name` (`itap.profile_full_name`, migration `1792365700284`) is the profile's
  `displayField` and its `recordTitle`, so pickers and relation cells show and search the whole
  name (Hasura filters and sorts on the computed field). Any other multi-field label still needs
  its own computed field.
- **Expected from a framework:** relation labels and pickers that use `recordTitle` (or a declared
  label template over several fields).

### G30. A record type cannot be changed
- **Need:** a visitor who becomes an employee, a contractor taken on as staff: `profile_type` is
  updatable by `org_admin` and the access engine reacts to it.
- **Framework (0.6.0):** the discriminator of `types` is never editable on edit
  (`screens/plan.ts`: `mode === 'edit' && node.field === compiled.discriminator`). **[code]**
- **Workaround:** `profile_type` is `write: 'create'` in the console; changing it needs a flow
  (not built) or a new profile.
- **Expected from a framework:** an opt-in "change type" on edit that switches the screen to the
  new type's fields (and drops the old type's values or keeps them, as declared).

### G31. `runFlow` reads only resources passed as real handles
- **Need:** flow checks and Check-again reads that look up another resource by its registered name
  (`resourceByName(...)`, used where importing the handle would make an import cycle).
- **Framework (0.6.0):** the runtime's `data.one` accepts the name-only handle, but `runFlow`'s
  in-memory data access looks rows up by `resource.ref.id`, which a name-only handle lacks, so the
  check throws and the flow halts with "Couldn't check". **[run]** (`run-flow.ts` `data.one`).
- **Workaround:** the merge flow's and the consent check's reads pass the imported `profile` handle
  (`src/modules/people/merge-profiles-flow.ts`, `consent-record.ts`); no cycle there.
- **Expected from a framework:** `runFlow` resolving a `{ kind: 'resource', ref: name }` handle like
  the runtime does.

### G32. An async check over the record does not decide a flow's button before the click
- **Need:** "Merge profiles" should be disabled with its reason on a pair whose profile is erased or
  restricted, as a synchronous record check would be.
- **Framework (0.6.0):** the pre-click pass decides the button from record-only `error` checks, but an
  async check that reads other rows (`data.one`) leaves the control `ready`; it blocks at submit with
  its message. **[run]** (`tests/modules/profile-records-flows.test.ts`).
- **Workaround:** the check blocks at submit (nothing is sent) and the comparison above the button
  already says which profile is erased or restricted.
- **Expected from a framework:** async record-only checks evaluated for the pre-click state (with a
  pending state while they run).

### G33. An Action's definite refusal reads as "may have been applied"
- **Need:** "Enroll face" with photos that all fail the quality check keeps its form and says which
  photo failed and why (Review Focus 1 of phase 4); a face that already belongs to an identity names
  it. Nothing was written, so the user should fix the photos, not "check the record".
- **Framework (0.6.0):** the Hasura provider classifies every error of a custom mutation over an
  Action as `sent` or `protocol/graphql-error` (the envelope does not say whether the Action ran),
  so the flow shows the unknown screen ("The request timed out. It may have been applied.") with
  the generic text, and the server's message never reaches the form. **[run]**
  (`createHasuraDataProvider` `graphqlError`; `flow-screen.tsx` `outcomeMessage`).
- **Workaround:** a provider wrapper (`src/data/action-refusals.ts` `withActionRefusals`, an
  extension point per design §10 call 1): a custom operation may declare a refusal reader
  (`hasuraOperation(..., refusals)`); for the backend codes it names (answered with HTTP 400 before
  any write) the wrapper rethrows a `validation` error whose `details.issues` land on the field the
  input key comes from (`fileIds` → `photos`, M14). Other codes pass through unchanged. Used by the
  three enrollment actions (`src/modules/people/enrollment-refusals.ts`).
- **Expected from a framework:** a declared refusal contract on a custom mutation (codes that mean
  "refused, nothing written", with their issue mapping), or a provider hook classifying Action
  errors by `extensions.code` (the server half of G14's "one result/error model").
- **Phase 4 Task 4:** the same wrapper reads the refusals of tracked SQL functions and one-row
  inserts (`src/data/sql-refusals.ts`): Hasura answers `itap.raise_code` with `permission-error` /
  `Check constraint violation. <code>`, which the provider also calls `sent` on a custom mutation;
  a function runs in one transaction, so the refusal is definite (merges, rollbacks, splits,
  verification decisions, relationships).

### G34. A bulk flow takes no form or review: a merge of the selection cannot choose its target
- **Need:** "Merge identities" over the identities selected in the list: choose which one is kept,
  review what moves, confirm, then one `merge_identities(target, sources)` call.
- **Framework (0.6.0):** a bulk flow may bind a single mutation (`submit.mutation`, one attempt slot
  per selection) and its portable `input` may read `ref('selection', 'ids')`, but `BulkFlowRunner`
  starts the run on the bar's click and only asks the confirm: a form or a review is never drawn,
  so the kept identity cannot be chosen; a function `input` gets no `selection`, and a relation's
  `candidates` cannot read `selection` either. **[code]** (`ui-shadcn/src/flows/flow-runtime.tsx`
  `BulkFlowRunner`, `core/src/flows/machine.ts` `buildInput`, `fields/candidates.ts`).
- **Workaround:** the kept identity is the page's record: "Merge into this identity" (item flow) with
  a multi-select of the identities to merge (candidates: not itself, not merged, same synthetic flag)
  and the review block; a duplicate pair has "Merge identities" with Keep first / second.
- **Expected from a framework:** a bulk flow with a hosted form and review over the selection
  (`ref('selection', …)` readable by `initial`, `candidates` and a function `input`).
- **Phase 7 Task 3:** the same gap blocks "Add to segment…" over the profiles or identities
  selected in a list: the bulk flow could send the selection (`add_segment_members(segment,
  ids)`), but nothing can ask which segment. Workaround: "Add members" on the segment (one flow
  per target, `when` on `target`) takes a multi-select of people or faces, which is the console's
  bulk add, and "Add to segment" on a profile or an identity adds that one record.

### G35. A flow's review step reads the flow's values as its record
- **Need:** the review of a merge or a rollback places a block that reads the flow's record (the
  pair, the merge) to say what moves.
- **Framework (0.6.0):** `ReviewTree` draws the review with a show-mode form controller whose value
  is the flow's values, so `ref('record', …)` in a review placement reads the values; the flow's
  record is out of reach there (the form body does read it). A block bound to the record waits
  forever ("Reading…"). **[run]** (`ui-shadcn/src/flows/flow-screen.tsx` `ReviewTree`;
  `tests/modules/profile-records-page.test.tsx` failed before the workaround: the Task 2 profile
  merge review never showed what moves).
- **Workaround:** the ids a review needs travel as hidden form values (`src/fields/carried-id.ts`,
  `in: []`, filled by `initial` from the record) and the review reads `ref('record', '<value>')`;
  the rollback flow gains a form for it, whose body shows the same block, so the dialog opens on
  what comes back.
- **Expected from a framework:** the flow's record (and `values`) as separate sources in the review,
  as in the form body.

### G36. A related list cannot list rows matching either of two keys
- **Need:** an identity's relationships, stored once per pair (`identity_a_id < identity_b_id`), on
  the identity page whichever side it is on, with "+ Create".
- **Framework (0.6.0):** a related list's `where` is a conjunction of `{ field, op, value }` entries;
  there is no `or`. **[code]** (`core/src/blocks/builtin.ts` related-list `where` schema). A create
  seeded from `where` would also write the pair unordered, which the database refuses half the time.
- **Workaround:** a block (`itap:identity-relationships`) over a custom query with `_or`; each row
  opens the relationship in a quick view (Edit, Delete); "Add relationship" on the identity orders
  the pair in its mutation.
- **Expected from a framework:** `or` groups in a related list's locked filter, and a create hook
  that can normalise the input (here: order the pair).

### G37. A date-time field is entered and shown as a date
- **Need:** a visit's expected window (`expected_start` / `expected_end`, `timestamptz`) entered with
  its time of day, and check-in/out times shown with it.
- **Framework (0.6.0):** `f.dateTime` renders the kit's `DateInput` (`<input type="date">`, the value
  cut to `YYYY-MM-DD`) and `DateDisplay` (`formatDate`: year, month, day), the same as `f.date`
  (`ui-shadcn/src/fields/default-renderers.ts` `dateTime: scalar(date)`). The filter builder alone
  uses `datetime-local`. **[code]** **[run]** (`tests/modules/visits-page.test.tsx`: the input was
  `type="date"` before the workaround).
- **Workaround:** the field `itap.date-time` (`src/fields/date-time*.ts(x)`): a `datetime-local`
  input in local time sending an ISO instant, and a date-and-time display in the console's locale.
  Used by visits; earlier read-only timestamps (last seen, decided at, …) still show the date only.
- **Expected from a framework:** `f.dateTime` with a date-and-time input and display (with the time
  zone of the instant made explicit).

### G38. Cursor lists stay empty under React StrictMode
- **Need:** the append-only logs (detections, tracking sessions, locations, device events; plan 03
  and plan 05) are cursor lists (`pagination: 'cursor'`), and the console mounts in `<StrictMode>`.
- **Framework (0.6.0):** `useInfiniteList` (`packages/react/src/hooks/data/use-infinite-list.ts`)
  creates its `InfiniteListObserver` in `useMemo` and disposes it in an effect cleanup. StrictMode's
  simulated unmount disposes the observer, the remount keeps the same (now inactive) instance, and
  `acceptInitial` ignores every page (`if (!this.#active …) return`): the first page is fetched but
  the list shows its empty state. Only in development (StrictMode double-invokes effects there only).
  **[code]** **[run]** (the detection list under `<StrictMode>` in jsdom shows no row; the dev
  server showed "No device events yet" with 8 events in the database).
- **Workaround:** a `pnpm patch` of `@burojs/react@0.6.0` (`patches/@burojs__react@0.6.0.patch`,
  root `package.json` `pnpm.patchedDependencies`), applied to `dist/index.js` and `dist/index.cjs`;
  the console keeps `<StrictMode>`. Test: `tests/modules/monitoring-page.test.tsx` "should show the
  first page of the log when mounted in StrictMode".
- **Fix for buro (exactly what the patch does):** `InfiniteListObserver` gets
  ```ts
  activate(): void { this.#active = true; }
  ```
  and `useInfiniteList` re-activates the memoized observer in the effect that disposes it:
  ```ts
  useEffect(() => {
    observer.activate();
    return () => observer.dispose();
  }, [observer]);
  ```
  The effect runs before the `acceptInitial` effect and before `useSyncExternalStore` subscribes,
  so after StrictMode's remount the first page is accepted and the listener is registered again.
  (Creating the observer inside the effect would work too but needs state for the first render.)
- **Expected from a framework:** the fix above (or an observer created in the effect that disposes
  it), so StrictMode's remount works.

### G39. A related list cannot order its own rows
- **Need:** a tracking session's Path tab (plan 05 Task 1) reads best oldest first (the order the
  person walked), while the locations list itself is newest first.
- **Framework (0.6.0):** `buro:related-list` takes `where`, `columns`, `pageSize`, `view`, `open`,
  `scope`, `count` (`packages/core/src/blocks/builtin.ts`), no `sort`: the rows follow the target's
  `views.list.defaultSort`. **[code]**
- **Workaround:** the path is shown newest first (the article says so).
- **Expected from a framework:** a `sort` prop on a related-list placement.

### G40. A related list's `where` cannot cross a relation
- **Need:** a person's Detections tab (plan 05 Task 1): detections carry the identity, the person is
  the identity's profile (`identity_id.profile_id`).
- **Framework (0.6.0):** a placement's `where` field must be a declared field of the target
  (`block.prop-invalid where field "identity_id.profile_id" is not a declared field of detection`),
  although the Hasura provider can translate dotted filter paths. A dotted leaf is refused in a show
  body too. **[run]**
- **Workaround:** a computed column on the table (`detections.profile_id`, function
  `itap.detection_profile_id`, migration `1792365700274`), declared as a relation field: the tab
  filters on it, and it doubles as the list's Person column and the known / unknown views. Known
  limit: a filter on a computed column uses no index (about 110 ms over Nova's 22k detections; it
  grows with the organization's detections). A relation filter (`identity: { profile_id }`) would use
  the `identity_id` index, which is what the dotted `where` would send.
- **Expected from a framework:** dotted `where` paths across to-one relations in related lists.

### G41. A polled list cannot page by cursor
- **Need:** the event log (plan 05 Task 2) is append-only (no count per page, keyset paging like the
  other logs) and watched live by operators (polling until G3's live fix ships).
- **Framework (0.6.0):** `views.list.refetchInterval` is ignored on a `pagination: 'cursor'` list
  (`use-resource-list.ts`: "a background refetch would fight the accumulator"; a console warning). **[code]**
- **Workaround:** the event list pages by offset (`count: 'manual'` and the mapping's `noAggregate`
  stay: no count query, Next while the page is full) and polls every 15 s. Deep offsets are slower than
  a keyset, acceptable for a list read from the top.
- **Expected from a framework:** a live cursor list that refreshes its first page (prepends new rows).

### G42. A related list's "+ Create" cannot follow the parent record's state
- **Need:** a rule version's Scope tab (plan 05 Task 2) adds places while the version is a draft;
  a published version's scope is history (the database refuses changes, `version_not_editable`).
- **Framework (0.6.0):** a placement's "+ Create" opens when the target's quick create passes the
  entry gate (`related-list-view.tsx`); no placement prop turns it off, and a `create` rule sees no
  parent record. **[code]**
- **Workaround:** two resources over `event_rule_version_scopes`: `event_rule_version_scope`
  (create/delete, placed while the version is open) and `event_rule_version_scope_history` (all
  operations off, placed otherwise), each in a panel with `when` on the version's status.
- **Expected from a framework:** `create: false` (or a condition) on a related-list placement.
- **Plan 05 Task 3:** the same twins for a closed incident's notes, note files, linked events and
  people (`incident_note(_history)`, `incident_note_file(_history)`, `incident_event(_history)`,
  `incident_identity(_history)`); the read-only twins double as the event's and the identity's
  Incidents lists. A note's files show "+ Create" to members who are not its author (the database
  refuses them); a create rule sees no parent record to tell.

### G43. Record types cannot key per-type fields stored inside one jsonb column
- **Need:** an event rule version's `parameters` jsonb holds different keys per rule type
  (`dwell_seconds` for unusual dwell, `watch_list_kinds` for watch lists), and the type lives on the
  header (`event_rules.rule_type`), not on the version.
- **Framework (0.6.0):** `types: { by }` discriminates on a field of the record and adds top-level
  fields; storing them inside a jsonb column needs the provider's `jsonbSpill`, which wants a second
  (meta) jsonb column. **[code]**
- **Workaround:** a computed column `event_rule_versions.rule_type` (migration `1792365700275`) and a
  custom field `itap.event-rule-parameters` keyed by the record's rule type (input, display and
  validator per type, other keys kept as stored).
- **Expected from a framework:** record types over a parent's field and per-type fields mapped to keys
  of one jsonb column.

### G44. A saved view cannot filter by the signed-in user
- **Need:** the incident list's "Mine" view (plan 05 Task 3): incidents assigned to the operator
  looking at the list.
- **Framework (0.6.0):** `views.list.savedViews[].state.filters` hold literal values only (the state
  is persisted and applied as a URL state, `SavedViewDef`); no reference to the session user. **[code]**
- **Workaround:** a computed column `incidents.assigned_to_me` (`itap.incident_assigned_to_me`, with
  the Hasura session argument; migration `1792365700276`), declared as a hidden boolean field: the view
  filters `assigned_to_me = true`.
- **Expected from a framework:** a session reference in a declared view's filter value (resolved when
  the view is applied), e.g. `{ field: 'assigned_to', op: 'eq', value: ref('user', 'id') }`.

G44 again (plan 05 Task 4): the shift handover views "Waiting for me", "For me" and "Sent by me" use
computed columns `shift_handovers.addressed_to_me` / `sent_by_me`, and the watch-list entries'
"Active" / "Expired" views use `watch_list_entries.active` (a saved view cannot say "now" either);
migration `1792365700277`.

### G45. Record types cannot discriminate on which of two columns is set
- **Need:** a watch-list entry names exactly one subject, a profile or an identity
  (`watch_list_entries_exactly_one_subject`); the create form must offer one of the two, never both
  or neither.
- **Framework (0.6.0):** `types: { by }` needs a discriminator column, and a typed create always sends
  it (`forms/controller/payload.ts`: `payload[discriminator] = input.type`); the table has no such
  column, and a generated one could not be inserted. **[code]**
- **Workaround:** two create-path resources over the same table, `watch_list_profile_entry` and
  `watch_list_identity_entry`, each declaring only its own subject (required, `write: 'create'`); the
  all-entries resource `watch_list_entry` reads both subjects and has create off. The list's People and
  Identities tabs and the profile's and identity's Watch lists tabs place the matching one.
  Phase 6 uses the same pattern twice: recipient group members (`recipient_group_user_member` /
  `recipient_group_address_member`, `recipient_group_members_exactly_one_recipient`) and escalation steps
  (`escalation_group_step` / `escalation_on_call_step`, `escalation_policy_steps_exactly_one_target`), each
  twin list filtered by its own target `nnull`; the read-only `escalation_step` lists a policy's whole
  sequence in step order with both targets.
- **Expected from a framework:** a type keyed by a predicate over the record (`present(profile_id)`)
  whose create sends no discriminator, or a create-time choice between field groups.

### G46. A page cannot order its nodes from data
- **Need:** the operator workspace page shows the panels the operator's workspace lists
  (`operator_workspaces.layout.panels`), in that order.
- **Framework (0.6.0):** a page body is a static tree; `when` can hide a node but nothing reorders
  nodes, and a ref into a `source.list` reads only `rows` whole or `total`, not `rows.0.layout`.
  **[code]**
- **Workaround:** a query `itap:operator-workspace-layout` answers the layout as slots `slot1..slot4`
  (declared output fields), and the page places each panel in each slot under
  `when: equals(ref('workspace', 'slotN'), panel)` (16 conditional panels, one shown per slot).
- **Expected from a framework:** a data-driven order for a container's keyed children (a `order` ref
  naming child keys), or a repeat node over a list source.

### G47. The facts block cannot poll
- **Need:** the operator workspace's Occupancy panel shows the facility's figures now
  (`itap:workspace-occupancy-facts`) and must follow them while an operator keeps the page open.
- **Framework (0.6.0):** `buro:facts` (`ui-shadcn/src/blocks/facts-view.tsx`) calls
  `useCustomQuery(handle, input, { enabled })` with no other option, and its props
  (`query`, `input`, `rows`, `view`, `title`, `missing`) carry no refetch interval; a resource list
  has `refetchInterval`, a custom query placed in a page has nothing. **[code]**
- **Workaround:** a small block `itap:occupancy-updated` placed under the facts reads the same
  query with the same input and `refetchInterval: 15 s` and says when the figures were read; the
  descriptors are equal, so both share one cache entry and the facts block re-renders with every
  read (plan 05 final review I3).
- **Expected from a framework:** a `refetchInterval` (or `poll`) prop on `buro:facts`, and the
  "as of" time of the read shown by the block.

### G48. A record form shows no server refusal text
- **Need:** an incident saved with an assignee, or a handover with a recipient, who is no longer an
  active member is refused by the database (`member_not_active:<column>`,
  `itap.active_member_check`); the form should say so on that field.
- **Framework (0.6.0):** a record form (create/edit page) reports a failed write through
  `record-screen.tsx` `setSubmitError` and `frame-pieces.tsx` `failureText`, which shows a friendly
  title for known transport messages and otherwise `errors.failed` ("Validation failed"); a
  `validation` error's `details.issues` reach the form only in a flow
  (`flows/machine.ts` `serverFormIssues`). A provider wrapper that turned the refusal into a
  `validation` error with an issue on the field was tried (plan 05 final review D2): the page still
  showed "Validation failed". **[code]**
- **Workaround:** the functions' refusal maps (flows) carry `member_not_active`
  (`MEMBER_NOT_ACTIVE_REFUSAL`, `src/data/sql-refusals.ts`); the record forms keep the generic
  message, and the fields' `doc.summary` say an active member is required.
- **Expected from a framework:** a record form that places a write's `validation` issues on their
  fields (or form-level with their text), as flows do.
- **Also (plan 10):** a policy version waiting for approval is frozen by the database: a child write
  (adding a subject or target through the twin resources) is refused with
  `access_policy_version_pending`, which the related list's create form shows only as the generic
  refusal. The version page offers no add there (the frozen list is read only), so it is reached
  only by a stale page.

### G49. A link cannot target an enum (enum-set junctions)
- **Need:** a notification rule's event types and channels (plan 06 Task 1) are rows of junction
  tables whose other end is an enum value (`notification_rule_event_types.event_type`,
  `notification_rule_channels.channel`), not a record; the plan wanted read links (chips, `has*`
  filters) like the record junctions of phases 2–5.
- **Framework (0.6.0):** `f.relationMany({ to, through })` needs `to` to be a registered resource
  (`packages/field-types/src/types/relation-many.ts`); an enum is not one, and the Hasura enum tables
  (`event_types`, `notification_channels`) are not readable by `org_admin`. `f.enum` has no
  multi-value form. **[code]**
- **Workaround:** no read link: the rule page has an **Event types** and a **Channels** tab, each a
  related list of the junction resource (add / remove, enum badges); the list page shows neither.
- **Expected from a framework:** a link (or an `f.enumSet`) over a junction whose target key is an
  enum value, read as enum chips and filterable with `hasAny`.

### G50. A record form cannot place a database refusal on a node of a structured field
- **Need:** the notification conditions trigger refuses with one code
  (`notification_rule_conditions_invalid`), without saying which condition; a record form would
  map it to the condition's row of `itap.notification-conditions`.
- **Framework (0.6.0):** record forms show no server refusal text at all (G48), and a field
  validator gets only the form values (`ValidationContext`: `values`, `field`), no data access, so
  it cannot check ids against the organization. **[code]**
- **Workaround:** the editor checks the references itself against the records it offers (an id
  that names nothing any more, an area outside the chosen facility) and shows the problem on that
  condition's row; it offers only valid combinations (areas of the chosen facility, the area dropped
  when the facility changes). The validator checks the shape (keys, uuids, severities) with the
  issue path naming the condition, and the editor marks that row. A race (a record deleted between
  loading and saving) still ends in the generic "Validation failed".
  Segment conditions (plan 07 Task 2) meet the same wall with a path the database does name
  (`segment_condition_invalid:$.children[2].value`): the mounted editor publishes the server's
  field catalog and the organization's records (`segment-conditions-registry.ts`, as G17), so the
  field validator runs every check of `itap.validate_segment_node` and answers one issue per node
  with that JSON path as its sub-path; the editor marks the node an issue names (any issue with a
  `$…` path, so a server issue would land there too once forms carry them). On a record form a
  server refusal still reads "Validation failed"; the "Create segment" flow names the refused
  condition from the path in its refusal text.

### G51. A related list cannot reorder its rows
- **Need:** escalation policy steps (`step_no`) and on-call rotation members (`position`) are
  ordered children; people expect to drag a row up or down (or use move up / move down).
- **Framework (0.6.0):** a related list sorts by a field and offers create, edit and delete per
  row; nothing moves a row or renumbers its siblings, and a flow cannot read the neighbouring rows
  to swap two numbers in one write. **[code]**
- **Workaround:** the order is a number the person edits (step number, position), listed in
  ascending order, bounded like the CHECKs (`step_no >= 1`, `position >= 0`); a number used twice
  is refused by the unique constraint. The help suggests gaps (10, 20, 30) so a row can be inserted
  without renumbering the others.
- **Expected from a framework:** an ordered related list (`order: { field }`) with drag and
  move up / down that rewrites the order field of the moved rows in one batch.

### G52. An enum picker lists the whole enum, not the field's values
- **Need:** a field that takes a subset of an enum: the notification channel of a rule, an
  escalation step, a template, a group member or a subscription is every channel but `webhook`
  (DB CHECK `*_channel_not_webhook`); an external address takes email or SMS only.
- **Framework (0.6.0):** `enumField(values, namespace)` keeps `values` for validation, but the
  input of a field with `ui.enum` is `EnumPicker` (`ui-shadcn/src/fields/default-renderers.ts`),
  which reads `useEnumValues(enumName)` and lists every registered value; the field's own values
  are never consulted, so the webhook was offered (and only refused on save). **[run]**
  (`tests/modules/notification-subscriptions-page.test.tsx` listed five options before the fix.)
- **Workaround:** subset enums registered beside the full one, same values, colours and texts:
  `notification_person_channel` (in-app, email, SMS, push) and `notification_address_channel`
  (email, SMS), console-only (`CONSOLE_ONLY_ENUMS`); the channel fields bind them.
- **Expected from a framework:** the picker offers the intersection of the enum and the field's
  declared values (or an `options` filter on the field).

### G53. A field cannot be required on create only
- **Need:** a webhook's signing secret (`webhook_subscriptions.secret`, `NOT NULL`) is write-only:
  the create form must refuse an empty box, while the edit form starts empty (the secret is never
  read back) and an empty box there means "keep the stored one".
- **Framework (0.6.0):** `required` is a boolean or a predicate `(ctx, values)`; the form
  controller passes its `ctx` but no form mode, and a field validator gets `{ values, field }`
  only (`ValidationContext`). Nothing tells a create form from an edit form. **[code]**
- **Workaround:** `secret({ required: true })` validates with the form values: no `id` among them
  (a create form) and an empty box is refused (`validation.itap.secret.required`); an edit form's
  values carry the record's `id`, so the box may stay empty. The input hides "Remove the stored
  value" for such a secret (`meta.removable: false`), since `null` would break the `NOT NULL`.
- **Expected from a framework:** `required: 'create'` (or the form mode in the predicate and
  validator context), and a write-only field kind with "keep / replace / remove" built in.

### G54. The built-in Delete cannot say why the database refused it
- **Need:** deleting a segment that is in use or has history is refused by a guard trigger
  (`segment_referenced`, a `permission-error` envelope) or a NO ACTION foreign key
  (`*_segment_fkey`, `constraint-violation`); the user must read which one and what to do
  (archive instead), plan 07 Review Focus 5.
- **Framework (0.6.0):** the built-in `delete` flow submits a resource delete
  (`submit.delete`); its refusal keeps the provider's classification (`forbidden` / `conflict`)
  and the dialog shows the generic sentence. A resource has no refusal reader for its own writes;
  only custom mutations can be wrapped (`withActionRefusals`). **[code]**
- **Workaround:** the segment declares its own `delete` flow (same name, so it replaces the
  built-in) over a custom mutation `deleteSegment` (`delete_segments_by_pk`) bound with
  `sqlRefusals(DELETE_SEGMENT_REFUSALS)`; Check again reads the segment back (`segmentDeleted`).
  The dialog then shows the framework's "The server refused the values" line above the reason.
- **Expected from a framework:** a per-resource refusal reader for create / update / delete (or
  the provider's `details` rendered by the delete dialog), so a built-in write can say why.

### G55. A flow without a form or a review cannot show its answer in a block
- **Need:** "Evaluate now" on a dynamic segment (`evaluate_segment`) needs no input but must show
  what the server answered: how many joined and left by rule, the member count, or that a newer
  evaluation had already run (stale).
- **Framework (0.6.0):** `then.open: { block }` draws the block in the flow's host, and a flow has
  a host only with a `form` or a `review` (`compileFlow`: `hasHost = form !== undefined ||
  review !== undefined`). A flow with neither runs from the button and its `then.open` block is
  never drawn, without a diagnostic; `confirm` opens a dialog but is no host. A review of only an
  empty panel draws nothing either. **[run]** (`core/src/flows/compile.ts`,
  `ui-shadcn/src/flows/flow-action-button.tsx` `useHostedFlow`;
  `tests/modules/segment-membership-page.test.tsx` showed nothing before the workaround).
- **Workaround:** the flow has a review that places the same block without result props
  (`itap:segment-evaluation`, which then says what an evaluation does); the run starts on the
  review's button and the answer replaces it in the dialog.
- **Expected from a framework:** a `then.open: { block }` on a hostless flow opens a host for the
  answer (or `checkApp` reports the block as unreachable).

### G56. A closed enum select shows the chosen option's help text in its trigger
- **Need:** a form's enum select (segment kind, target, status; every enum whose values carry
  `doc.summary`) shows the chosen value's label when closed; the help belongs in the open list.
- **Framework (0.6.0):** `EnumPicker` renders each `SelectItem` with the label and, below it, the
  value's doc summary in one child; Radix clones the item's text into the trigger on selection,
  so the closed trigger shows label and summary, overflowing the box (seen in the phase 7 demo on
  the segment create form). **[run]** (`ui-shadcn/src/enum/enum-picker.tsx`, the comment above
  `optionDoc` already notes the cloning).
- **Workaround:** none (cosmetic); the e2e suites select options by a label prefix.
- **Expected from a framework:** the summary outside `SelectItemText` (Radix `ItemText` for the
  label only), so the trigger shows the label.


### G57. A page has no control for its own parameters (a period picker)
- **Need:** the Analytics page (plan 08 Task 1) shows its charts for one period chosen by the user
  (last 24 hours, 7 or 30 days), kept in the address.
- **Framework (0.6.0):** a page's `params` are read from the query string into the `route` source,
  but nothing draws a control that sets them: no param picker in the page chrome and no block or
  node that writes a page param. A keyed `tabs` node is the only built-in that keeps a choice in
  the URL. **[code]** (`core/src/screens/page-screen.ts`, `docs/screens-guide.md` "Page bodies").
- **Workaround:** the periods are keyed tabs (`?period=last-7d`); each tab places its own copy of
  the period's blocks with literal `days` props (the placements are repeated per period; a closed
  tab reads nothing).
- **Expected from a framework:** a param control in the page chrome (enum params as a segmented
  control or select), or a node that binds a control to a page param, so placements read
  `l.ref('route', 'period')` once.

### G58. A placement has no title, and a grid has no column count
- **Need:** each analytic block on the Analytics page needs a heading ("Busy hours"); the open
  incidents and the device health should sit side by side in two columns.
- **Framework (0.6.0):** a `place` node draws the block's view only (no heading from the block's
  `texts.label` or the placement's `texts`); `l.grid` takes no column count and lays its children in
  the kit's fixed grid, so two long lists became three narrow columns with one empty. **[run]**
  (`ui-shadcn/src/blocks/place-node.tsx`, `ui-shadcn/src/screen/nodes.tsx` `Layout`; seen in the
  Task 1 screenshots).
- **Workaround:** every placement is wrapped in a titled panel (`l.panel([l.place(...)], { texts })`),
  and the two lists are stacked full width.
- **Expected from a framework:** a placement heading (opt-in `texts.title`), and `l.grid(children,
  { columns })`.

### G59. A block view cannot read a query's field labels or an enum value's label as text
- **Need:** the KPI tiles (`itap:kpis`) label the same `dashboard_kpis` figures the dashboard's facts
  block labels from the query's declared `fields`; chart hover titles and legends name enum values
  (severities, device health, channels) as plain strings inside SVG `<title>`.
- **Framework (0.6.0):** a custom query handle exposes only `kind` and `ref` (`CustomQueryHandle`),
  so a view cannot read its `fields` texts; enum labels are resolved inside `<EnumBadge>` (a React
  element), with no hook returning the translated label string. **[code]**
  (`core/src/data/custom-operation.ts`, `ui-shadcn/src/enum/enum-badge.tsx`).
- **Workaround:** the KPI block repeats the six labels in its own `texts`; legends render
  `<EnumBadge presentation="plain">`; SVG hover titles, accessible names and chart data tables use
  our own `useEnumLabel` (`src/blocks/charts/use-enum-label.ts`), which repeats `<EnumBadge>`'s
  resolution with the exported `resolveEnumLabel` / `enumValueText`.
- **Expected from a framework:** a `useQueryFieldLabel(query, field)` / `useEnumLabel(enum, value)`
  hook (or the field texts on the handle).

### G60. A block cannot place blocks chosen from data (a dashboard's widgets)
- **Need:** a dashboard (plan 08 Task 2) draws its saved widgets, up to 50, each one of twelve
  analytic blocks with props from the widget's `params`, at the widget's place on a 12-column grid;
  the editor previews the widgets on screen the same way.
- **Framework (0.6.0):** placements are declared in a screen's body, so how many blocks a page
  draws and which ones are fixed when the app is defined; a `block()` prop takes a placement
  declared beside it, not one built from data. A block view cannot render another block: the
  placement machinery (`usePlacement`, the place node's chrome, prop validation with defaults,
  `data` entries, the block's `t`) is internal to a placed node, the app's block catalogue has no
  public hook (`useBlockImplementations` is not exported) and there is no `renderBlock`. A grid
  of fixed slots × blocks with `when` (the operator workspace pattern) would need 600 placements,
  and a node cannot take its grid column and span from data either. **[code]**
  (`react/src/blocks/use-placement.ts`, `react/src/index.ts`, `ui-shadcn/src/blocks/place-node.tsx`).
- **Workaround:** one block, `itap:dashboard-grid`, draws the tiles itself: each widget's props go
  through the block's own schemas with `validatePlacementProps` (exported), its view comes from our
  map of the registered implementations (`src/blocks/dashboard-grid/widget-views.ts`), its texts
  from `blocks.<id>.*` through `I18nContext` (`block-t.ts`), and the two blocks with `data` entries
  (`itap:occupancy-now`, `itap:health-chart`) get them read by the tile (`widget-data.tsx`). Each tile
  has its own error boundary. Grid starts and spans are literal Tailwind classes per number.
  A tile's error boundary resets when the widget's kind, source or settings change (the editor
  preview recovers once the settings are fixed). Known limit: a tile's "no access" note checks only the
  widget's own query; blocks that read more (`deviceHealthDay` reads `device_health_metrics_aggregate`,
  `occupancyNow` reads floor plans and areas) are not checked for those and may show empty data or the
  failed note for a viewer who cannot read them.
- **Expected from a framework:** a dynamic placement (`l.each(ref, item => l.place(...))` or a
  `renderBlock(block, props)` component that mounts a placement with its chrome, data and texts),
  and per-child grid placement on `l.grid` (column start, span and row span from a ref).

### G61. A record page does not follow its record while the server moves it on
- **Need:** a report's page (plan 08 Task 3) shows queued → generating → completed or failed as the
  platform generates it (seconds), then its file link, or its error and Retry.
- **Framework (0.6.0):** `refetchInterval` is a list option only (`views.list.refetchInterval`); the
  show screen reads its record once (and again after a mutation's effects), and push invalidation
  needs a provider live channel (`ResourceMapping.live`, not set up for Hasura here). A block can
  ask for a re-read through the public `useDispatcher().effects.refetch([resource])` (the path of a
  mutation's effects), but nothing polls the record by itself. **[code]**
  (`core/src/types/resource.ts` `refetchInterval`, `core/src/data/push-invalidation.ts`,
  `react/src/dispatch/dispatcher-context.tsx`).
- **Workaround:** the progress block `itap:report-status` reads the report itself
  (`reportProgress`, polling every 3 s while queued or generating) and, once the read status differs
  from the status the page shows, calls `useDispatcher().effects.refetch([report])`, so the record,
  its file panel, error panel and Retry are read again.
- **Expected from a framework:** `views.show.refetchInterval` (a number or a function of the record,
  e.g. while its status is pending).

### G62. A link cannot be written with its record (targets frozen at insert)
- **Need:** a report's facilities and segments (`report_facilities` / `report_segments`) must exist
  when the report row is inserted: generation starts on the insert and the targets are frozen once
  it leaves `queued` (`report_targets_frozen`).
- **Framework (0.6.0):** a link (`f.relationMany({ through })`) is read only: never a form input and
  never part of a create payload; the Hasura mapping has no nested-insert transform for a create.
  **[doc]** (`field-types/README.md` "Limits of this version").
- **Workaround:** the reports list's create is off; "New report" is a resource flow whose form has
  plain `f.relationMany` columns (`facility_ids`, `segment_ids`) and whose custom mutation
  `createReport` inserts the report with nested `report_facilities` / `report_segments` in one
  statement. Per-type parts of the form are `when`s on the chosen type (record types would need the
  same nested write).
- **Expected from a framework:** writable links on create (nested junction rows in the provider's
  create), or a create view whose submit can be bound to a custom mutation.

### G63. A resource-level flow placed inline on a custom page is drawn without its label
- **Need:** the Search page (plan 09 Task 1) is a resource-less page whose body is the search form
  (`search_faces`) with the results block in its place once it ran.
- **Framework (0.6.0):** a page names a flow with `{ app }` or `{ resource, flow }`
  (`buro:inline-flow`). For `{ resource, flow }` `PageInlineFlow` hands `InlineFlowHost` the target
  but no resource, name or label, so `useFlowChrome('', '')` answers an empty label and the submit
  button has no text (`ui-shadcn/src/flows/inline-flow-view.tsx`). `checkApp` also reports
  `flow.page-host-missing` for such a flow with `host: { page }`, because its resource view has no
  `page` lookup (the compiler's own check passes). An app flow (`{ app }`) gets its label, but an app
  flow must be portable: a form field with a schema or a validator (any `f.enum`, `f.number` with
  `validate`) is refused ("only submit.input and submit.onUnknown.check may be functions"). **[code]**
- **Workaround:** the page places a block that draws a current-record screen (as the settings page,
  G13/G16) of `search_workspace`, a read-only twin resource over the organization's
  `organization_settings` row, whose show tree places the item flow `search` inline
  (`src/modules/search/search-workspace.ts`). The item flow keeps the typed fields and checks.
- **Expected from a framework:** the page inline host resolving a resource-level flow's chrome from
  its resource and name; `checkApp` passing pages to the resource view; app flows taking the same
  field declarations as resource flows.

### G64. A form field cannot pick several values of an enum
- **Need:** search filters take lists of identity statuses and profile types
  (`filters.status`, `filters.profile_type`, `itap.valid_search_filters`).
- **Framework (0.6.0):** `f.enum` has one value; there is no multi-value enum field (an `enumSet`)
  for a flow form or a jsonb key (G49 is the same wall for junctions). **[code]**
- **Workaround:** the search form picks one status and one profile type and sends each as a list of
  one; a stored definition with several (written by another client) is shown as stored and run
  again unchanged, and read back into the form with its first value (`searchValuesOf`).
- **Expected from a framework:** a multi-select enum field (`f.enum(values, { multiple: true })`)
  whose value is an array.

### G65. A flow form's body cannot read the record
- **Need:** "Run again" on a past search shows the threshold and fuzzy fields for a face search and
  hides them for an attribute search, by the record's `search_type`.
- **Framework (0.6.0):** a flow form's `when` reads the form's values (and scope, user) only; a
  `record` ref in `form.body` is `ref.unknown-source` at run time (`createFlowFormPort`), and the
  layout types refs by the form's own fields. **[code]**
- **Workaround:** two item flows with the same label, each with its own `when` on the record's type
  (`run_again` with threshold, limit and fuzzy; `run_attributes_again` with the limit only).
- **Expected from a framework:** `record` (and `with` sources) readable from a flow form's `when`s.

### G66. A query's poll interval cannot follow its own answer
- **Need:** the search results block (plan 09) reads a search request again while it is queued or
  running, and stops once it finished.
- **Framework (0.6.0):** `useCustomQuery` options type `refetchInterval` as `number | false`
  (`NativeQueryOptions`), although `useQueryDescriptor` hands the option to TanStack Query
  unchanged, whose `refetchInterval` also takes a function of the query (its latest data).
  **[code]**
- **Workaround:** `pollWhile(pending, ms)` (`src/data/poll-while.ts`) builds TanStack's function and
  passes it through the declared type; the results block polls with it (no state or effect).
  `itap:report-status` still keeps the last status in state.
- **Expected from a framework:** `refetchInterval?: number | false | ((query) => number | false)`.

### G67. A flow's warnings are not shown while its form is filled in
- **Need:** editing a saved search says, as soon as the search itself is changed, that saving
  resets its alert baseline (plan 09 Review Focus 5).
- **Framework (0.6.0):** a flow evaluates its `checks` on submit: warnings appear on a last step
  before sending (Back / Cancel / submit), never inline beside the form, whatever `trigger`
  (`'always'`) or `anchor` says; a check's `record` is available there only. **[run]** (jsdom page
  test: no warning after changing a field and leaving it; the warning step on submit).
- **Workaround:** the baseline warning is a flow check (`savedSearchBaselineReset`, comparing the
  record's definition with the form's) shown on that last step, so the reset is confirmed before
  anything is sent; the form's "Schedule and alerts" panel also says it in its description, and the
  saved search page shows "No alert baseline yet" from the row itself after saving.
- **Expected from a framework:** a flow form running its checks live (debounced) as a record form
  does, honouring `trigger` and `anchor`.

### G68. A layout body cannot be shared by forms with different field maps
- **Need:** the saved search form is the search form (`searchFormBody`) plus name, sharing,
  schedule and alerts.
- **Framework (0.6.0):** `Layout<F>` is typed by its own field map, and a body written for a smaller
  map does not type-check inside a larger one, even generically (`Layout<F extends Search>`
  narrows every key to `Extract<keyof F, string>`). **[run]** (typecheck)
- **Workaround:** the saved search body calls `searchFormBody(l as unknown as Layout<SearchFields>)`;
  the nodes name only search fields, which the larger form has too, and `checkApp` checks the result.
- **Expected from a framework:** a layout of a superset map assignable to a subset's, or a typed
  "fragment" helper.

### G69. `runFlow` cannot script a flow's custom query sources
- **Need:** unit tests of "New saved search" and "Edit" (both read `with` sources over custom
  queries: the organization's default threshold, the saved search as form values).
- **Framework (0.6.0):** `runFlow` scripts mutations and resource rows only; a custom query throws
  "custom queries are not scripted". **[code]**
- **Workaround:** both flows are tested on screen over a fake Hasura
  (`tests/modules/saved-search-page.test.tsx`); Run now (no sources) is tested with `runFlow`.
- **Expected from a framework:** `queries` scripts in `RunFlowOptions`, as `mutations`.

### G70. A related list has no filters of its own
- **Need:** a bulk job's rows listed by outcome (failed first, succeeded, all), with columns that
  depend on the job's kind (profile rows vs bulk search rows).
- **Framework (0.6.0):** `relatedList` takes a fixed `where`, `columns`, `search` and `pageSize`; it
  has no filter bar, saved views or outcome chips, and its columns cannot follow the record. **[code]**
  (`buro:related-list` props)
- **Workaround:** the job page has tabs "Failed rows", "Succeeded" and "All rows", each placing two
  related lists with a fixed `outcome in [...]` where, one per kind, shown by a `when` on the
  record's kind (`src/modules/search/bulk-job.ts`).
- **Expected from a framework:** a related list placement with `filters` (pinned fields, saved
  views) as a resource list has, and per-placement column sets chosen by a condition.

### G71. A form cannot produce a file from what was entered
- **Need:** a bulk face search reads a CSV of the member's own search photo ids; members pick
  photos, they do not write CSV files of file ids.
- **Framework (0.6.0):** no file field (G2) and no hook between a form's values and an upload: a
  flow's `submit.input` is synchronous and cannot upload. **[code]**
- **Workaround:** a custom field input (`itap.bulk-search-photos`,
  `src/fields/bulk-search-photos-input.tsx`) uploads each photo as a `search` image, writes the CSV
  (`bulk-search-csv.ts`) and uploads it as the `bulk_input` file, writing that file's id as the
  value. Photos and CSV files of an abandoned form stay in the bucket (as with any upload field).
- **Expected from a framework:** `f.file` with a "derived file" step, or an async `submit.prepare`
  step a flow runs before its mutation.

### G72. A confirm-only flow loses its `then.notify` toast in a real browser
- **Need:** every flow with a confirmation and no form or review (Cancel job, Retry, acknowledge
  and close incidents, event rules, reports, invitations, user notifications) says what happened
  in a toast.
- **Framework (0.6.0):** `@burojs/core` (`dist/index.js` ~1893) hosts a flow only when
  `hasHost = form || review`. The `FlowRunner` of `@burojs/ui-shadcn` (`flow-runtime-*.js`) calls
  `launch().finally(() => onCloseRef.current())`, and `onClose` (`check-confirm-dialog-*.js`
  ~607-612, `() => setRunning(false)`) unmounts the runner, while `runThen` in `@burojs/react`
  (`flows-runtime.js`) runs the notify in a `useEffect` after the success render, by which time the
  runner is gone. jsdom's `act` flushes the effect first, so unit tests pass and hide it. **[run]**
- **Workaround:** none; the mutation applies, the toast is missing.
- **Expected from a framework:** `then` effects run from the launcher or before `onClose`.

### G73. A flow cannot submit a read-only query (a dry run)
- **Need:** "Simulate" on an access policy version: a period and a sample size chosen, then the
  answer of `simulate_access_policy` (a STABLE function exposed as a GraphQL query: it writes
  nothing) shown in a block; plan 10 calls it a simulation flow.
- **Framework (0.6.0):** a flow's `submit` binds exactly one mutation (`FlowSubmit`: `mutation`,
  `create`, `update`, `delete`, `each`); there is no `query` binding. The Hasura provider runs a
  custom operation only under the kind it was registered with (`registeredOperation`), and the
  registry test holds every document to its declared kind, so a `defineMutation` over a GraphQL
  `query` document is refused. **[code]**
- **Workaround:** a modal action placing a block in a sheet (`r.action.modal('simulate', …)`), as
  the notification rule "Test rule" (phase 6): the block holds the period and sample-size pickers
  and runs `useCustomQuery`, so changing them simulates again (`src/modules/access/simulation-*`).
- **Expected from a framework:** `submit: { query }` for a read-only flow (no idempotency key, no
  lost-answer check), or a block-hosted "dry run" step whose answer `then.open` can show.

### G74. A field hidden by a condition keeps its stored value on save
- **Need:** a policy version's **Maximum risk** applies to an allow only; the draft form hides it for
  a deny (`l.field('max_risk', { when: effect = allow })`), and a value kept from an earlier allow
  should be cleared when the version is saved as a deny.
- **Framework (0.6.0):** a field hidden by a layout `when` is not sent as `null` (phase 6 ruling on
  `max_cycles`, `tasks/ui/rulings-06-notifications.md`; not re-measured here), and a record form
  has no hook to change the values it writes. **[ruling]**
- **Workaround:** none in the console. The access engine reads `max_risk` on an allow only
  (`itap.evaluate_access`), so a stale value on a deny decides nothing; the show page hides it for
  a deny too. No database trigger was added (it would only tidy a value nothing reads).
- **Expected from a framework:** a form option to send `null` for fields hidden by a condition, or a
  `submit.transform` on record forms.

### G75. A record page cannot read a related record's column
- **Need:** a policy version's rules (no edit, submit or roll back) depend on its policy's
  `is_archived`.
- **Framework (0.6.0):** dotted relation columns (`policy_id.is_archived`) are read by lists only:
  `@burojs/hasura` adds `relationSelection` to list reads, while `one` selects
  `mapping.selectFields` alone, so a rule on the record page never sees them. **[code]**
  (`packages/hasura/src/data-provider.ts` `one`)
- **Workaround:** the mapping's `selectFields` carry a nested selection, `'policy { is_archived }'`
  (`src/modules/access/index.ts`), so list, many and one rows hold `policy.is_archived`; the rule reads
  it (`policyArchived`, `src/modules/access/policy-version-rules.ts`). Checked against the dev stack
  (`tests/integration/access-grants.dev.test.ts`).
- **Expected from a framework:** `one` reads the dotted relation columns a screen or a rule declares,
  like lists do.
