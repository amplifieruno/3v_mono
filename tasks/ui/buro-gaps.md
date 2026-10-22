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
