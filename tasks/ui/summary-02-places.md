# Summary — phase 2: Places

Plan: `plan-02-places.md`. Spec: `design.md`. Framework gaps: `buro-gaps.md`.
Branch `feat/ui-console`, commits `dec7261..4fb2c50` (tasks 1-4), the places smoke suite and this
summary. Demo video: `playwright-output/phase-02-places.webm` (a facility with its occupancy facts,
the area tree, floor plans with area shapes and access points, drawing a shape on a plan, the
apply-template preview; nothing is saved by the recording).

## What was built

All in `apps/admin-ui/`, on buro 0.6.0, in a new `places` ConsoleModule (`src/modules/places/`).

- **Facilities** (`facility.ts`, `occupancy.ts`): full CRUD, nav section Places. The show page has
  the occupancy facts (`facility_occupancy_now`: on site now, occupied areas, areas over capacity),
  keyed tabs Details / Areas / Access points, and an "Apply template" action. Time zone, operating
  hours (`timeWindows`, empty = always open) and the custom attributes are reused fields.
- **Areas** (`area.ts`, `area-tree*.ts(x)`, `area-parent-guard-*`): full CRUD; "Inside" picks a
  parent in the same facility; the facility page shows the **area tree** (collapse, expand all,
  occupancy over capacity in red, "+" to add an area inside, first 100 areas); the sidebar facility
  picker narrows the areas list. A form block warns when the chosen parent is one of the area's own
  sub-areas; the database `area_cycle` refusal is the backstop.
- **Floor plans** (`floor-plan.ts`, `src/blocks/floor-plan/`): CRUD with the image as a storage file
  and pixel size read from the image; the **floor-plan block** (`itap:floor-plan`) draws the plan,
  the shapes of the areas whose nearest plan it is, occupancy labels and the access points placed on
  it. The block is placed on the floor plan page and on the area page.
- **Access points** (`access-point.ts`, `access-point-device.ts`): full CRUD with a position clicked
  on the plan; a Devices tab binds devices (device shown by id until phase 3).
- **Facility templates** (`facility-template.ts`, `apply-template*.ts`, `template-overlap*`): CRUD
  with the structure as a validated JSON field shown as a tree; the facility "Apply template" form
  previews the areas it creates, names top-level names already there, and reports "Template applied:
  N areas created (M at the top: ...)".
- **Articles** for facility, area, floor plan, access point, access point device and facility
  template under `places/docs/<scope>/`, summaries on every non-obvious field.

## Reusable for later phases

- **`customFields({ entity })`** (`src/fields/custom-fields*.ts(x)`, `custom-field-control.tsx`):
  one control per active custom attribute definition of the entity (text, number, date, yes/no,
  select), checks that mirror `itap.validate_custom_fields` (required, type, options; an unchanged
  stored value is not rechecked), values of inactive or deleted attributes kept visible. For profiles
  and identities (phase 4). Hazard: two mounted inputs of the same entity share one snapshot (G17).
- **`areaShape()`** (`src/fields/area-shape*.ts`): nullable json; Polygon / Circle tools drawn on
  the plan found through the area's own plan or the nearest enclosing area's, drag to move, other
  shapes drawn faintly, points kept on the image. Stored shape format is `itap.valid_shape`. Reuse for
  `devices.coverage` (phase 3).
- **`planPosition({ areaField })`** (`src/fields/plan-position*.ts`): nullable `[x, y]`, click to
  place, Clear, same plan lookup. For access points now, devices in phase 3.
- **Plan plumbing** (`plan-canvas.tsx`, `plan-context.ts`, `plan-rows.ts`, `plan-geometry.ts`,
  `plan-shape-check.ts`, `plan-size-registry.ts`, `presigned-url.ts`): SVG in plan pixel space,
  pointer to plan pixels, plan lookup with `useList`, `usePresignedUrl` (also used by the storage
  file display).
- **Floor-plan block** (`itap:floor-plan`): takes a plan or an area; add device markers by
  extending its data entries (phase 3).
- **Area tree block** and **`resourceByName(name)`** (`src/data/resource-by-name.ts`): a by-name
  resource handle for placing a block or related list that reads a resource importing the caller
  (breaks import cycles). `src/modules/places/resource-names.ts` holds the shared names.
- **`templateStructure()`** field (JSON editor, validator, tree display) and the shared
  `TemplateTree`.
- **Enums**: `src/enums/places.ts` (facility status, area type / access level / status, access point
  kind / direction / role).
- **Dev-stack tests** for the places resources: `tests/integration/{facilities,areas,floor-plans,
  access-points-templates}.dev.test.ts`.

## Rulings (from the ledger)

- `customFields` workaround for G17 (validator reads module-level state keyed by entity, published
  by the mounted input) judged safe: a failure means a weaker client check, never a false block.
- Area form: no sub-areas list inside the area form itself; the Sub-areas tab is a self-related list
  through `resourceByName`. The area tree reads at most 100 areas ("showing the first N of M").
- Shapes and positions are stored as the database defines them (`{type:'Polygon', coordinates}`,
  `{type:'Circle', center, radius}`, `[x, y]`), not as the plan first guessed. An area finds its plan
  by its own plan, then the nearest ancestor's (a superset of "the floor").
- Applying a template twice doubles its areas (`apply_facility_template` never skips names). The
  console warns when a top-level name is already there; making the function idempotent is a
  data-layer change, filed as bd `3v_mono-62p`.
- The access point's device is shown by id (`f.uuid`) until phase 3 has a device resource
  (bd `3v_mono-5t6`).
- A server CHECK refusal (`area_cycle`, G14) arrives as a permission error and shows the generic
  alert; the console checks are the real guard.

## Found by the smoke suite

One real bug: **the console did not start in the dev server.** `facility.ts` -> `area-tree-block.ts`
-> `area.ts` -> `facility.ts` is an import cycle, and when the browser evaluates `facility.ts` first,
`area.ts` reads `FACILITY_RESOURCE` before it is initialised ("Cannot access 'FACILITY_RESOURCE'
before initialization"). Vitest evaluates the modules in another order and the production build
bundles them, so unit tests, lint, typecheck and build were all green. Fixed by moving the name to
`resource-names.ts` (re-exported from `facility.ts`). Nothing else broke.

## Framework gaps met

G17 a validator cannot read what its input loaded nor the stored value; G18 a form check cannot test
the chosen value against a list read for it (workaround: the area-parent-guard block); G19 a field
input cannot set another field (width and height are filled from the image by a separate field); G20 a flow form's
layout is typed as a create screen and its values start absent (the template form casts
`ref('record','id')` and seeds `form.initial`). Details and workarounds: `tasks/ui/buro-gaps.md`.
G2/G3 stay fixed upstream (unreleased).

## Deferred

- Minors from reviews: the custom-fields input republishes its snapshot on every render (depend on
  status and definitions instead); `isTimezone` accepts any name the browser resolves (server CHECK
  is the backstop); a `custom_fields` loaded as null counts as empty; SVG plan uploads without an
  intrinsic size give width 0; switching the shape tool replaces the shape silently; about 1 px
  offset in picks near the border; `checkFromArea` is an English literal, not a `FieldProblem` key;
  notification text "1 areas"; the overlap check reads at most 500 areas; a null `mapResult` gives
  the generic error.
- bd `3v_mono-mln` (P3): the shape editor has no keyboard input (points are pointer-only).
- bd `3v_mono-5t6` (P3): link access point bindings to the device resource.
- bd `3v_mono-62p` (P3): `apply_facility_template` should skip names that already exist under the
  same parent.
- Carry-overs to phase 3: a device link on the access point bindings (replace the id with the device
  relation and `relationMany` through `access_point_devices`); devices on the floor plan (markers
  from `planPosition` on `devices`, coverage from `areaShape` on `devices.coverage`); facility and
  area articles name "devices" only generally.
- Carried from earlier phases and still open: bd `3v_mono-ryj` (P1, `profile_document` upload by
  `org_admin`) before phase 4.
- The e2e removes every row it creates (areas deepest first, then the facility, the access point and
  the attribute definition; the `afterAll` sweep covers a failed step) and restores the seeded room's
  shape. Dev runs still leave audit rows (create and delete per run).

## Gates

Unit/jsdom 272 passed (30 dev-stack skipped); with `ITAP_DEV_STACK=1` 301 passed (1 skipped, 53 files); e2e 22 passed (auth, foundation, organization, places).
Lint, typecheck and build clean.

## How to run

```bash
make dev-compose && pnpm seed                      # dev stack and demo data
pnpm --filter admin-ui dev                         # console on http://127.0.0.1:5173
pnpm --filter admin-ui lint && pnpm --filter admin-ui typecheck
pnpm --filter admin-ui test                        # unit/jsdom
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test       # + dev-stack tests
ITAP_DEV_STACK=1 SEED_PASSWORD=... pnpm --filter admin-ui test:e2e   # foundation + organization + places
pnpm --filter admin-ui build
```

`SEED_PASSWORD` is in `apps/backend/.env`. hasura-auth allows 10 sign-ins per 5 minutes; each e2e spec
shares one session (about 2 sign-ins per spec including the organization setup), so leave about five
minutes between the dev-stack tests and the e2e run. The dev-stack suite itself now signs in
once per file (11+ files), so a run that starts inside another run's five-minute window fails its
last files with `429`; rerun after a quiet window.
