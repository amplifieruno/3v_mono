# Task: Demo Update — Dashboard, Facilities & Segments

## Goal

Implement three major features to significantly enhance the demo experience:

1. **Dashboard with Analytics** — A compelling landing page with real metrics and charts
2. **Facility & Area Management** — Core domain entity for organizing physical spaces
3. **Segment Management** — Rule-based identity grouping with visual builder

These features transform the demo from a basic CRUD application into a platform that demonstrates real business value for identity tracking and access management.

## Context

**Current state:** The platform has working Identity CRUD, Profile CRUD, Face Recognition (InsightFace + Human library), and real-time WebSocket detection. However:
- The dashboard is empty (redirects to identity list)
- There is no concept of physical locations (facilities/areas)
- There is no way to group identities into logical segments
- There are no analytics or metrics visualizations

**Why this matters:** Stakeholders need to see a platform, not a collection of CRUD pages. A dashboard gives immediate context, facilities ground the system in physical reality, and segments demonstrate intelligent grouping — all critical for a convincing demo.

**References:**
- `docs/base/Functional_Specification.md` — Sections 4 (Segments), 7 (Facilities), 10 (Analytics)
- `docs/stages/SA_3_EN.md` — Sections 2.1.3, 2.1.5, 2.1.6

## Scope

### Included
- Dashboard page with metric cards, charts, and recent activity
- Facility CRUD (create, list, edit, view, delete)
- Area CRUD with hierarchy (nested areas within facilities)
- Segment CRUD with rule builder UI
- Segment membership (manual and rule-based)
- Hasura migrations and metadata for all new tables
- GraphQL codegen for type-safe operations
- Navigation/sidebar updates

### NOT Included
- Real-time tracking on facility maps (future task)
- Floor plan upload or map integration (future task)
- Device management or camera assignment (future task)
- Automated segment evaluation engine (segments are manually evaluated for demo)
- Report export (PDF/Excel) — demo shows charts only
- Notification system integration
- Geofencing or GPS coordinates

## Beads Issues

- `3v_mono-2m8`: Dashboard & Analytics page (P1)
- `3v_mono-faw`: Facility & Area Management (P1)
- `3v_mono-mdw`: Segment Management with Rule Builder (P1)

## Technical Approach

### Data Layer (Hasura-first)
All new tables go into the `itap` schema with standard patterns:
- UUID primary keys with `gen_random_uuid()`
- `created_at` / `updated_at` timestamps with auto-update triggers
- Staff role permissions (full CRUD)
- Relationships tracked in Hasura metadata

### Frontend (Existing patterns)
Follow established resource structure:
- `resources/{name}/` with pages/, queries.ts, resourceConfig.tsx, router.tsx
- shadcn/ui components (Card, Button, Form, DataTable, etc.)
- Refine hooks (useTable, useForm, useNavigation)
- GraphQL via `gql` tagged templates
- lucide-react icons

### Charts
Use Recharts library (lightweight, React-native, good for demo):
- Area charts for trends
- Bar charts for distributions
- Pie/donut charts for breakdowns

## Estimated Effort

| Spec | Effort | Priority |
|------|--------|----------|
| 01 - Dashboard & Analytics | 2-3 days | High |
| 02 - Facility & Area Management | 2-3 days | High |
| 03 - Segment Management | 3-4 days | High |
| **Total** | **7-10 days** | |

## Dependencies

- Existing Hasura infrastructure (running)
- Existing admin-ui with Refine + shadcn/ui
- GraphQL codegen pipeline
- No external service dependencies
