# Spec 02: Facility & Area Management

## Objective

Implement Facility and Area entities with full CRUD operations, hierarchical area nesting, and admin UI pages. This establishes the physical location model that all future features (device placement, tracking, analytics) depend on.

## Data Model

### Table: `itap.facilities`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT `gen_random_uuid()` | Unique identifier |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Auto-updated timestamp |
| `name` | `text` | NOT NULL | Facility name |
| `description` | `text` | | Optional description |
| `address` | `text` | | Physical address |
| `timezone` | `text` | NOT NULL, DEFAULT `'UTC'` | Facility timezone |
| `status` | `text` | NOT NULL, DEFAULT `'active'` | active / inactive / maintenance |

**Relationships:**
- `facilities` → `areas` (one-to-many via `facility_id`)

### Table: `itap.areas`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT `gen_random_uuid()` | Unique identifier |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Auto-updated timestamp |
| `facility_id` | `uuid` | NOT NULL, FK → `itap.facilities(id)` | Parent facility |
| `parent_id` | `uuid` | FK → `itap.areas(id)` | Parent area (for nesting) |
| `name` | `text` | NOT NULL | Area name |
| `description` | `text` | | Optional description |
| `area_type` | `text` | NOT NULL, DEFAULT `'zone'` | building / floor / room / zone / sector |
| `access_level` | `text` | NOT NULL, DEFAULT `'public'` | public / restricted / secure / classified |
| `capacity` | `integer` | | Max occupancy (optional) |
| `status` | `text` | NOT NULL, DEFAULT `'active'` | active / inactive / maintenance |

**Relationships:**
- `areas` → `facility` (many-to-one via `facility_id`)
- `areas` → `parent` (self-referential many-to-one via `parent_id`)
- `areas` → `children` (self-referential one-to-many via `parent_id`)

## Hasura Migrations

### Migration 1: Create facilities table

**File:** `apps/nhost/nhost/migrations/default/{timestamp}_create_table_itap_facilities/up.sql`

```sql
CREATE TABLE "itap"."facilities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "description" text,
  "address" text,
  "timezone" text NOT NULL DEFAULT 'UTC',
  "status" text NOT NULL DEFAULT 'active',
  PRIMARY KEY ("id")
);

CREATE TRIGGER "set_itap_facilities_updated_at"
BEFORE UPDATE ON "itap"."facilities"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();

COMMENT ON TRIGGER "set_itap_facilities_updated_at" ON "itap"."facilities"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';

CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

**down.sql:**
```sql
DROP TABLE "itap"."facilities";
```

### Migration 2: Create areas table

**File:** `apps/nhost/nhost/migrations/default/{timestamp}_create_table_itap_areas/up.sql`

```sql
CREATE TABLE "itap"."areas" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "facility_id" uuid NOT NULL,
  "parent_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "area_type" text NOT NULL DEFAULT 'zone',
  "access_level" text NOT NULL DEFAULT 'public',
  "capacity" integer,
  "status" text NOT NULL DEFAULT 'active',
  PRIMARY KEY ("id"),
  CONSTRAINT "areas_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "itap"."facilities"("id")
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT "areas_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "itap"."areas"("id")
    ON UPDATE RESTRICT ON DELETE SET NULL
);

CREATE TRIGGER "set_itap_areas_updated_at"
BEFORE UPDATE ON "itap"."areas"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();

COMMENT ON TRIGGER "set_itap_areas_updated_at" ON "itap"."areas"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
```

**down.sql:**
```sql
DROP TABLE "itap"."areas";
```

### Hasura Metadata

**File:** `apps/nhost/nhost/metadata/databases/default/tables/itap_facilities.yaml`

```yaml
table:
  name: facilities
  schema: itap
array_relationships:
  - name: areas
    using:
      foreign_key_constraint_on:
        column: facility_id
        table:
          name: areas
          schema: itap
insert_permissions:
  - role: staff
    permission:
      check: {}
      columns:
        - name
        - description
        - address
        - timezone
        - status
select_permissions:
  - role: staff
    permission:
      columns:
        - id
        - created_at
        - updated_at
        - name
        - description
        - address
        - timezone
        - status
      filter: {}
      allow_aggregations: true
update_permissions:
  - role: staff
    permission:
      columns:
        - name
        - description
        - address
        - timezone
        - status
      filter: {}
      check: null
delete_permissions:
  - role: staff
    permission:
      filter: {}
```

**File:** `apps/nhost/nhost/metadata/databases/default/tables/itap_areas.yaml`

```yaml
table:
  name: areas
  schema: itap
object_relationships:
  - name: facility
    using:
      foreign_key_constraint_on: facility_id
  - name: parent
    using:
      foreign_key_constraint_on: parent_id
array_relationships:
  - name: children
    using:
      foreign_key_constraint_on:
        column: parent_id
        table:
          name: areas
          schema: itap
insert_permissions:
  - role: staff
    permission:
      check: {}
      columns:
        - facility_id
        - parent_id
        - name
        - description
        - area_type
        - access_level
        - capacity
        - status
select_permissions:
  - role: staff
    permission:
      columns:
        - id
        - created_at
        - updated_at
        - facility_id
        - parent_id
        - name
        - description
        - area_type
        - access_level
        - capacity
        - status
      filter: {}
      allow_aggregations: true
update_permissions:
  - role: staff
    permission:
      columns:
        - facility_id
        - parent_id
        - name
        - description
        - area_type
        - access_level
        - capacity
        - status
      filter: {}
      check: null
delete_permissions:
  - role: staff
    permission:
      filter: {}
```

**Update** `tables.yaml` to include both new files.

## Frontend Implementation

### Files to Create

```
apps/admin-ui/src/resources/facility/
├── data/
│   └── enums.tsx                # Status, timezone enums
├── pages/
│   ├── list/
│   │   ├── index.tsx            # Facility list with DataTable
│   │   └── columns.tsx          # Column definitions
│   ├── create/
│   │   └── index.tsx            # Create facility form
│   ├── edit/
│   │   └── index.tsx            # Edit facility form
│   └── show/
│       └── index.tsx            # Show facility with area hierarchy
├── queries.ts                    # GraphQL operations
├── resourceConfig.tsx            # Refine resource config
└── router.tsx                    # Facility routes

apps/admin-ui/src/resources/area/
├── data/
│   └── enums.tsx                # Area type, access level enums
├── pages/
│   ├── list/
│   │   ├── index.tsx            # Area list (filterable by facility)
│   │   └── columns.tsx          # Column definitions
│   ├── create/
│   │   └── index.tsx            # Create area form (with facility selector)
│   └── edit/
│       └── index.tsx            # Edit area form
├── components/
│   └── AreaHierarchy.tsx        # Tree view component for area nesting
├── queries.ts                    # GraphQL operations
├── resourceConfig.tsx            # Refine resource config
└── router.tsx                    # Area routes
```

### Files to Modify

```
apps/admin-ui/src/app/App.tsx
  - Add facilityConfig and areaConfig to resources
  - Add FacilityRouter and AreaRouter routes

apps/admin-ui/src/app/components/appSidebar/NavMenu.tsx
  - Replace placeholder "Facilities" with real link
  - Add "Areas" navigation item
```

### Enums

```tsx
// facility/data/enums.tsx
export const facilityStatuses = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Maintenance', value: 'maintenance' },
];

// area/data/enums.tsx
export const areaTypes = [
  { label: 'Building', value: 'building' },
  { label: 'Floor', value: 'floor' },
  { label: 'Room', value: 'room' },
  { label: 'Zone', value: 'zone' },
  { label: 'Sector', value: 'sector' },
];

export const accessLevels = [
  { label: 'Public', value: 'public' },
  { label: 'Restricted', value: 'restricted' },
  { label: 'Secure', value: 'secure' },
  { label: 'Classified', value: 'classified' },
];
```

### GraphQL Operations

**facility/queries.ts:**

```graphql
fragment itap_facility on itap_facilities {
  id
  created_at
  updated_at
  name
  description
  address
  timezone
  status
  areas_aggregate {
    aggregate { count }
  }
}

query FacilityListQuery($limit: Int = 10, $offset: Int = 0, $where: itap_facilities_bool_exp = {}, $order_by: [itap_facilities_order_by!] = {}) {
  itap_facilities(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
    ...itap_facility
  }
  itap_facilities_aggregate(order_by: $order_by, where: $where) {
    aggregate { count }
  }
}

query FacilityOneQuery($id: uuid!) {
  itap_facilities_by_pk(id: $id) {
    ...itap_facility
    areas(order_by: { name: asc }) {
      id
      name
      area_type
      access_level
      parent_id
      status
      children_aggregate { aggregate { count } }
    }
  }
}
```

**area/queries.ts:**

```graphql
fragment itap_area on itap_areas {
  id
  created_at
  updated_at
  facility_id
  parent_id
  name
  description
  area_type
  access_level
  capacity
  status
  facility { id name }
  parent { id name }
  children_aggregate { aggregate { count } }
}
```

### Key UI Features

#### Facility List
- DataTable with columns: Name, Address, Status, Areas Count, Created At
- Status filter (active/inactive/maintenance)
- Create button

#### Facility Show Page
- Facility details card (name, address, timezone, status)
- **Area Hierarchy** — tree view showing nested areas
  - Collapsible tree nodes
  - Area type icons (building, floor, room, zone)
  - Access level badges (color-coded)
  - "Add Area" button at each level
  - Click area to navigate to area edit

#### Area Create/Edit
- Facility selector (dropdown)
- Parent area selector (dropdown, filtered by selected facility)
- Name, description, area type, access level, capacity, status fields

#### AreaHierarchy Component
Recursive tree component:

```
📍 Main Building (building)
  ├── 📍 Floor 1 (floor) [public]
  │   ├── 📍 Lobby (zone) [public]
  │   ├── 📍 Reception (room) [restricted]
  │   └── 📍 Server Room (room) [classified]
  └── 📍 Floor 2 (floor) [restricted]
      ├── 📍 Open Office (zone) [restricted]
      └── 📍 Meeting Room A (room) [restricted]
```

Uses shadcn/ui `Collapsible` or custom tree with indentation. Each node shows:
- Icon based on `area_type`
- Name
- Access level badge
- Child count
- Edit/delete actions

## Seed Data

For demo purposes, create a seed script or manual entries:

```
Facility: "ITAP Demo Office"
  ├── Building A (building)
  │   ├── Ground Floor (floor)
  │   │   ├── Main Lobby (zone, public)
  │   │   ├── Reception (room, restricted)
  │   │   └── Security Office (room, secure)
  │   ├── Floor 1 (floor)
  │   │   ├── Open Workspace (zone, restricted)
  │   │   ├── Meeting Room 1 (room, restricted)
  │   │   └── Meeting Room 2 (room, restricted)
  │   └── Floor 2 (floor)
  │       ├── Executive Area (zone, secure)
  │       └── Server Room (room, classified)
  └── Parking Garage (building)
      ├── Level P1 (floor, public)
      └── Level P2 (floor, restricted)
```

## Acceptance Criteria

- [ ] `itap.facilities` table created via Hasura migration
- [ ] `itap.areas` table created with self-referential hierarchy
- [ ] Hasura metadata with relationships and staff permissions
- [ ] GraphQL codegen runs successfully with new types
- [ ] Facility list page with DataTable, filtering, sorting
- [ ] Facility create page with form validation
- [ ] Facility edit page
- [ ] Facility show page with area hierarchy tree
- [ ] Area list page (filterable by facility)
- [ ] Area create page with facility and parent selectors
- [ ] Area edit page
- [ ] Area hierarchy displays correctly with nesting
- [ ] Navigation sidebar shows Facilities and Areas links
- [ ] Access level badges are color-coded
- [ ] Quality gates pass: `pnpm lint`, `pnpm typecheck`
