# buro: feedback from building the ITAP console

Everything the ITAP console (phases 0–3 so far, `@burojs/*` 0.6.0) ran into with buro, in one place:
defects, missing capabilities, API papercuts, documentation problems and wishes. Each item points to
its detailed entry in `tasks/ui/buro-gaps.md` (`G<n>`, with evidence, workaround and test) where one
exists. Status as of 2026-10-22.

Legend: **[run]** reproduced by running it · **[code]** read in the source · **[doc]** docs only.

## 1. Already fixed upstream (unreleased) — drop our workaround on the next release

| Gap | What | Upstream | Our workaround to remove |
|---|---|---|---|
| G2 | `f.file` edit/create not wired to the mapper on Hasura | PR #137 | `src/fields/storage-file*` |
| G3 | Hasura live socket keeps the old token after an org switch (and leaks a socket per rotation) | PR #139 | polling via `refetchInterval` |
| G10 | `useList`/`useOne` reads never run `AuthProvider.onError` (registry lease has no auth controller) **[run]** | PR #147 | `SessionWatch`, `check()` refresh |

## 2. Defects and behaviour that surprised us

1. **Record forms don't run a field's declared constraints** (G14) **[run]**: `f.number({ min, max, integer })`
   and the field's zod schema are never run; default messages don't name the range.
2. **Flow forms ignore the field type's format** (G11) **[run]**: `f.email()` in a flow accepts `not-an-email`.
3. **Server refusals never reach a field** (G14) **[run]**: `<RecordScreen>` shows one alert;
   `normalizeServerRecordIssues` is flows-only; Hasura `permission-error` on a CHECK violation becomes
   `forbidden` → "Validation failed".
4. **An edit payload carries every active field, dirty or not** (G24): no way to send a column only when
   entered.
5. **Validator string results become the generic code** `validation.validator.invalid`
   (Standard Schema issues → `schema.invalid`), so a translator can't target them; only the
   `{ code, message: { key, default } }` shape is translatable — undocumented in the forms guide.
6. **A self-referencing `relatedList` throws at definition time**: `handleRef` calls the thunk while
   lowering the tree, so `relatedList(() => area)` inside `area` fails; works only with a by-name
   `{ kind: 'resource', ref }` cast that relies on internals (G19 related).
7. **`readOnly` is refused on a resource field** (use `write: 'never'`/`system`) — not obvious from the
   field options type or guides.
8. **`use()` contribution ids share the flat registry namespace with section names**: `use('organization', …)`
   collides with the `organization` section.
9. **Import-order trap**: a resource module importing another resource's handle can produce a TDZ
   (`Cannot access 'X' before initialization`) only in the Vite dev server — lint, typecheck, unit tests
   and build were green. A "resource names" module + import-cycle lint fixed it; buro could ship a
   by-name target API (see wish 4) so modules don't import each other's handles.
10. **`useIdentity` is `pending` (not loading) during session transitions**: guards must branch on
    `status`, not `isLoading`.
11. **The example's `onError` matches HTTP 401**, but Hasura answers an expired JWT with HTTP 200 +
    `invalid-jwt`; match `kind === 'auth'` instead.
12. **Hasura mapping defaults**: `pkType` defaults to `bigint` and `orderByField` to `id`; a uuid/no-`id`
    schema gets runtime 400s per resource until set — a schema-introspection check (we wrote one) would
    catch it at startup.
13. **Main bundle > 500 kB** once `@burojs/ui-shadcn` is imported; lazy chunks per block help, but the
    kit itself is heavy.

## 3. Missing capabilities (by area)

### Auth and session
- No Nhost / OIDC refresh-token auth adapter, no token store, no "secondary (tenant) token" hook (G1).
- `RequireAuth` is app code in the example, not exported.

### Data and providers
- No `updateMany` / `deleteMany` in the Hasura provider; bulk = row by row, ≤ 100 (G4).
- Many-to-many links are read-only; attach/detach "later" (G5).
- `source.list` caps at 100 rows; no series/bucketed read for charts (G25).
- A relation field can't choose the read scope of its options (G21).
- Read scope: picker slices load and persist nothing; rules read the resolver `scope` slice while
  queries read `dataSession.scopeKey`, kept in step by hand (G6).
- No public by-name resource target for sources/related lists (G19 related).

### Forms, fields, checks
- Field validators can't read what their input loaded, nor the record/stored value (G17).
- A field input can't set another field (no form-scoped `setValue` / declared derivation) (G19).
- No source keyed by form values; no membership operator in the portable grammar or the Hasura
  provider (G18).
- No write-only field option (G24).
- No field default from a source/scope selection (`default: ref('scope', …)`) (G22).
- Flow form layout is typed as a create screen (no `record`), field `default`s don't seed flow values,
  and a prop can't be `.optional()` with a ref default (G20).
- `onUnknown.check` can't see the submitted input (G12).
- Flow notifications can't pick a count form (`then.notify` passes `count` only inside `params`) (G23).
- Enum colours are a closed set without `neutral` / `caution` (G9).

### Screens and navigation
- No current-record ("my organization", "my preferences") resource view; needs a custom page (G13).
- `<RecordScreen>` heading can't be hidden or replaced (G16).
- The list search placeholder names only the first search field; no `texts` slot for it (G15).
- Saved views and column layouts are per browser, not per user/tenant, by default (G7).

### Docs (embedded handbook)
- `<DocBrowser>` lists only resource and glossary scopes — no module/guide articles; `guide`/`page`
  scopes are reserved but never listed (G8).

## 4. Documentation problems we hit

- `docs/screens-guide.md` shows `fields: (f) => ({ … })`; `defineResource` throws on a function.
- `docs/forms-guide.md` file upload section still describes `storageAdapter` / `uploadViaHasuraStorage`.
- `docs/data-provider-guide.md` and others still use pre-0.6 flat `label:` spellings; command-palette and
  theming guides are partly about removed playground code.
- `fieldTypesPlugin()` doesn't register `textarea` and `code`, though both exist on `f`.
- `app.registry.customPages.keys()` (as written in places) doesn't exist; use `list()`.
- The translatable validator issue shape (`{ code, message: { key, default } }`) and its lookup order
  are not in the forms guide (see 2.5).
- Embedded-docs guide: an article folder name must equal a registered resource, or the article is never
  listed (G8) — worth stating up front.

## 5. Wishes (what we'd expect a framework like this to have)

1. `f.relation({ scope })`, `f.string({ writeOnly: true })`, `default: ref('scope' | 'user', …)`.
2. Record forms validating declared constraints with range-aware messages, plus a provider hook mapping a
   server refusal (constraint name / error code) to a field issue.
3. A validator / check context with the edited record, the data runtime (async lookups), and form values
   as a source key (debounced).
4. Public by-name targets: `resourceRef('area')` for relations, sources and related lists.
5. Link writes (attach/detach chips) for many-to-many.
6. A series source for blocks that draw (`source.series` with buckets and measures).
7. Current-record resource views (record id from identity/scope) with the page title as heading.
8. Semantic enum tones (`neutral`, `caution`) or an app-registered palette.
9. `then.notify: { params, count }` and count forms in check/flow texts.
10. Guide/module articles listed by `<DocBrowser>` with titles from the bundle.
11. An Nhost (or generic refresh-token) auth adapter with tenant-token support.
12. A list search placeholder `texts` slot.

## 6. What worked well (keep it)

- Declarative resources + layout trees + record `types` covered most screens without custom code.
- Flows (`form`/`review`/`confirm`/`then`) over `defineMutation` made every server function a guarded,
  re-read, idempotent action with almost no UI code.
- `facts`, `relatedList`, `inlineFlow`, custom blocks and frames composed cleanly; `checkApp`,
  `runFlow`, `describeScreen` and `checkFrame` made the UI testable without a browser.
- 0.6.0 read scope (`data.scope`), dotted relation columns and read links landed exactly when needed.
- `texts` + declared-text layer + docs-integrity made "English in code, translations later, docs from
  day one" practical.
