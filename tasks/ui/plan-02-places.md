# ITAP Console Phase 2 — Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Facilities, their area trees, floor plans with drawn area shapes and positioned access
points, access points with their bound devices, and facility templates applied in one flow.

**Architecture:** A new `places` ConsoleModule (`src/modules/places/`, already holding the read-only
phase-0 `facility`) following `tasks/ui/summary-00-foundation.md` and `summary-01-organization.md`
conventions. New reusable pieces: `customFields({ entity })` field type (inputs generated from
`custom_attribute_definitions`), the `itap:floor-plan` block (viewer), and two plan-space field types
`areaShape()` and `planPosition()` (edited over the floor plan image). Facility-dimension resources
declare `data.scope: { facility: { field: 'facility_id' } }` so the sidebar facility picker narrows them.

**Tech Stack:** as phase 0/1 (no new runtime dependencies; drawing is plain SVG over the image).

**Spec:** `tasks/ui/design.md` §6.4; data model `tasks/data-layer/design.md` §6.6 (+ §6.0 geo/shape
conventions, §6.4 custom attributes).

## Global Constraints

- Everything in `plan-00-foundation.md` and `plan-01-organization.md` Global Constraints applies.
- Columns, update permissions and enum values from metadata (`itap_facilities`, `itap_areas`,
  `itap_floor_plans`, `itap_access_points`, `itap_access_point_devices`, `itap_facility_templates`)
  and the dev DB. System columns (`code`, `number`, `path`, `depth`, `areas_count`,
  `current_occupancy`) are `system`.
- Shapes are in floor-plan pixel space: GeoJSON-like `{ type: 'Polygon', coordinates: [[[x,y],…]] }`
  or `{ type: 'Circle', center: [x,y], radius }` (verify against the DB validation in the
  data-layer migrations); positions `{ x, y }` in the same space (verify).
- An area finds its floor plan through its floor ancestor (`floor_plans.area_id` is the floor).
- Facility-dimension resources (areas, floor plans, access points, access point devices) declare
  `data.scope` with key `facility`; facilities themselves never do.
- Tree display and drawing are custom blocks/field types done the buro way (`defineBlock`/
  `implementBlock`, `fieldImplementation`), documented, with `checkFrame`/`renderBlock` tests where
  applicable.

## Review Focus

1. Selecting a facility in the sidebar narrows areas, floor plans and access points to it; "All
   facilities" shows everything. — Task 2 test.
2. Moving an area under its own descendant is refused with a clear message (DB guards cycles). —
   Task 2 test `refuses moving an area under its own descendant`.
3. A polygon with fewer than 3 points, or a point outside the image, cannot be saved. — Task 3 test.
4. A custom attribute marked required blocks saving the facility; inactive definitions are not shown;
   values of removed definitions are kept, not dropped. — Task 1 test.
5. Applying a template to a facility that already has areas with the same names shows the server's
   outcome (created vs skipped) instead of silently doubling. — Task 4 test.

---

### Task 1: Facilities (CRUD, occupancy facts) and the reusable `customFields` field type

**Files:** `src/modules/places/facility.ts` (rewrite: full CRUD; name, code (system), address,
latitude, longitude, timezone (`timezone()`), operating_hours (`timeWindows()`), contact (json),
custom_fields (`customFields({ entity: 'facility' })`), status, areas_count, current_occupancy;
show tree tabs `details`, `areas` (placeholder panel until Task 2), `access_points` (Task 4)),
`src/modules/places/occupancy.ts` (`facilityOccupancyNow = defineQuery` over `facility_occupancy_now`,
shown with `facts` on the facility show header), `src/fields/custom-fields.ts` +
`custom-fields-input.tsx` + `custom-fields-display.tsx` (reads active definitions for the entity
through buro `useList` on `custom_attribute_definition`, ordered by `sort_order`; renders one input
per definition by `data_type`; enforces `required`; keeps unknown keys untouched),
`src/modules/places/docs/facility/index.en.md`.
**Tests:** custom-fields unit tests (required blocks, inactive hidden, unknown keys kept), facility
screen tests, dev-stack create/update/delete round trip.
**Commit:** `feat(ui): facilities and custom attribute fields`.

### Task 2: Areas and the area tree

**Files:** `src/modules/places/area.ts` (resource: facility_id (relation), parent_id (relation to
area, candidates limited to the same facility via `candidates`), name, area_type, access_level,
capacity, loitering_threshold_seconds, status, path/depth/current_occupancy system; shape edited in
Task 3; `data.scope` facility), `src/modules/places/area-tree-block.ts` + view (`itap:area-tree`:
indented, collapsible tree of a facility's areas with type badge, occupancy/capacity, links to each
area; placed in the facility show `areas` tab; uses one `source.list` read ordered by `path`),
`src/modules/places/docs/area/index.en.md` (tree, path, access levels, loitering).
**Tests:** tree building from rows (pure function), facility picker narrowing (Review Focus 1),
cycle refusal surfaced (Review Focus 2, dev-stack), area screen tests.
**Commit:** `feat(ui): areas and the facility area tree`.

### Task 3: Floor plans, the floor-plan block, `areaShape` and `planPosition` fields

**Files:** `src/modules/places/floor-plan.ts` (resource: facility_id, area_id (floor), name, level,
image_file_id (`storageFile({ bucket: 'organization', kind: 'floor_plan', accept: 'image/*' })` —
check the data layer's kind for floor plans), width_px/height_px (filled from the uploaded image when
empty), scale_m_per_px; `data.scope` facility), `src/blocks/floor-plan/*` (`itap:floor-plan` block:
image + SVG overlay of the floor's area shapes (coloured by access level, labelled, occupancy) and
access points (icon by kind); props `floorPlanId`; placed on floor plan show and on area show of a
floor), `src/fields/area-shape*.ts(x)` (`areaShape()`: json field; input draws/edits a polygon or
circle over the area's floor plan; display = small preview), `src/fields/plan-position*.ts(x)`
(`planPosition()`: click to place a point), wire `shape` on area and `position` on access point.
**Tests:** shape validation (Review Focus 3), polygon/circle geometry helpers, `renderBlock` of the
floor plan with fake data, dev-stack upload + shape save.
**Commit:** `feat(ui): floor plans with drawn area shapes`.

### Task 4: Access points, bound devices, facility templates

**Files:** `src/modules/places/access-point.ts` (resource: facility_id, area_id, from_area_id,
name, kind, direction, position (`planPosition()`), is_entry_exit, face_credential, status;
`data.scope` facility; show tab `devices` with a `relatedList` of `access_point_device` (create/delete
rows; device relation resolves once phase 3 registers devices — until then show device id) and a read
link `f.relationMany({ through })` if the device resource exists, else defer the link to phase 3),
`src/modules/places/access-point-device.ts` (junction resource, `views.list.page: false`),
`src/modules/places/facility-template.ts` (resource: name, description, structure (json with a
read-only tree preview display)), `src/modules/places/apply-template.ts` (`applyFacilityTemplate =
defineMutation` over SQL function `apply_facility_template` with effects on area; item flow on
facility "Apply template" with a template picker form; `then.notify` with the server's counts),
docs for each resource.
**Tests:** apply-template flow (`runFlow`), Review Focus 5 (dev-stack: apply twice, second reports
skipped/created as the function returns), access point screens.
**Commit:** `feat(ui): access points and facility templates`.

### Task 5: Phase close

- [ ] `e2e/places.spec.ts`: create a facility with a required custom attribute; build two areas;
  draw a shape on a floor plan; add an access point at a position; apply a template; facility
  picker narrows the areas list.
- [ ] Full gates (lint, typecheck, test, build, dev-stack, e2e), demo recording
  `playwright-output/phase-02-places.webm`, `summary-02-places.md`, gaps and roadmap updated, commit, push.
