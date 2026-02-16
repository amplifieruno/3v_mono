# Spec 03: Segment Management

## Objective

Implement Segment entity with rule-based identity grouping, a visual rule builder UI, and membership management. Segments allow grouping identities by criteria (e.g., "All verified employees", "Visitors from last 7 days", "VIP Blacklist") — a key feature for demo scenarios like access control and monitoring.

## Data Model

### Table: `itap.segments`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT `gen_random_uuid()` | Unique identifier |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | Auto-updated timestamp |
| `name` | `text` | NOT NULL | Segment name |
| `description` | `text` | | Optional description |
| `color` | `text` | NOT NULL, DEFAULT `'#6366f1'` | Display color (hex) for badges/charts |
| `icon` | `text` | | Optional icon name (lucide icon key) |
| `segment_type` | `text` | NOT NULL, DEFAULT `'manual'` | manual / rule_based |
| `conditions` | `jsonb` | NOT NULL, DEFAULT `'{}'` | Rule conditions (JSON) |
| `status` | `text` | NOT NULL, DEFAULT `'active'` | active / inactive / archived |

### Table: `itap.segment_memberships`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, DEFAULT `gen_random_uuid()` | Unique identifier |
| `created_at` | `timestamptz` | NOT NULL, DEFAULT `now()` | When membership was added |
| `segment_id` | `uuid` | NOT NULL, FK → `itap.segments(id)` ON DELETE CASCADE | Parent segment |
| `identity_id` | `uuid` | NOT NULL, FK → `itap.identities(id)` ON DELETE CASCADE | Member identity |
| `is_active` | `boolean` | NOT NULL, DEFAULT `true` | Active membership flag |

**Unique constraint:** `(segment_id, identity_id)` — an identity can only be in a segment once.

### Relationships

- `segments` → `memberships` (one-to-many)
- `segment_memberships` → `segment` (many-to-one)
- `segment_memberships` → `identity` (many-to-one)

### Conditions JSON Schema

For `segment_type = 'rule_based'`, the `conditions` field stores rules:

```json
{
  "operator": "AND",
  "rules": [
    {
      "field": "status",
      "operator": "equals",
      "value": "verified"
    },
    {
      "field": "profile.last_name",
      "operator": "is_not_empty",
      "value": null
    },
    {
      "operator": "OR",
      "rules": [
        {
          "field": "created_at",
          "operator": "after",
          "value": "2024-01-01"
        },
        {
          "field": "attributes.department",
          "operator": "equals",
          "value": "Engineering"
        }
      ]
    }
  ]
}
```

**Supported operators by field type:**

| Field Type | Operators |
|------------|-----------|
| text | equals, not_equals, contains, starts_with, is_empty, is_not_empty |
| date | before, after, between, last_n_days |
| boolean | is_true, is_false |
| select | equals, not_equals, in |

**Available fields for rules:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | select | Identity status (verified/unverified) |
| `created_at` | date | Identity creation date |
| `profile.first_name` | text | Linked profile first name |
| `profile.last_name` | text | Linked profile last name |
| `profile.email` | text | Linked profile email |
| `has_profile` | boolean | Whether identity has a linked profile |
| `attributes.*` | text | Any key in identity attributes JSON |

**Note for demo:** Rule evaluation happens client-side for preview. For "Apply Rules" action, we translate conditions to a Hasura `where` clause and fetch matching identities, then insert memberships. This is simple and effective for demo scale.

## Hasura Migrations

### Migration 1: Create segments table

**File:** `apps/nhost/nhost/migrations/default/{timestamp}_create_table_itap_segments/up.sql`

```sql
CREATE TABLE "itap"."segments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "description" text,
  "color" text NOT NULL DEFAULT '#6366f1',
  "icon" text,
  "segment_type" text NOT NULL DEFAULT 'manual',
  "conditions" jsonb NOT NULL DEFAULT '{}',
  "status" text NOT NULL DEFAULT 'active',
  PRIMARY KEY ("id")
);

CREATE TRIGGER "set_itap_segments_updated_at"
BEFORE UPDATE ON "itap"."segments"
FOR EACH ROW
EXECUTE PROCEDURE "itap"."set_current_timestamp_updated_at"();

COMMENT ON TRIGGER "set_itap_segments_updated_at" ON "itap"."segments"
IS 'trigger to set value of column "updated_at" to current timestamp on row update';
```

**down.sql:**
```sql
DROP TABLE "itap"."segments";
```

### Migration 2: Create segment_memberships table

**File:** `apps/nhost/nhost/migrations/default/{timestamp}_create_table_itap_segment_memberships/up.sql`

```sql
CREATE TABLE "itap"."segment_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "segment_id" uuid NOT NULL,
  "identity_id" uuid NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  PRIMARY KEY ("id"),
  UNIQUE ("segment_id", "identity_id"),
  CONSTRAINT "segment_memberships_segment_id_fkey"
    FOREIGN KEY ("segment_id") REFERENCES "itap"."segments"("id")
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT "segment_memberships_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "itap"."identities"("id")
    ON UPDATE RESTRICT ON DELETE CASCADE
);
```

**down.sql:**
```sql
DROP TABLE "itap"."segment_memberships";
```

### Hasura Metadata

**File:** `itap_segments.yaml`

```yaml
table:
  name: segments
  schema: itap
array_relationships:
  - name: memberships
    using:
      foreign_key_constraint_on:
        column: segment_id
        table:
          name: segment_memberships
          schema: itap
insert_permissions:
  - role: staff
    permission:
      check: {}
      columns:
        - name
        - description
        - color
        - icon
        - segment_type
        - conditions
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
        - color
        - icon
        - segment_type
        - conditions
        - status
      filter: {}
      allow_aggregations: true
update_permissions:
  - role: staff
    permission:
      columns:
        - name
        - description
        - color
        - icon
        - segment_type
        - conditions
        - status
      filter: {}
      check: null
delete_permissions:
  - role: staff
    permission:
      filter: {}
```

**File:** `itap_segment_memberships.yaml`

```yaml
table:
  name: segment_memberships
  schema: itap
object_relationships:
  - name: segment
    using:
      foreign_key_constraint_on: segment_id
  - name: identity
    using:
      foreign_key_constraint_on: identity_id
insert_permissions:
  - role: staff
    permission:
      check: {}
      columns:
        - segment_id
        - identity_id
        - is_active
select_permissions:
  - role: staff
    permission:
      columns:
        - id
        - created_at
        - segment_id
        - identity_id
        - is_active
      filter: {}
      allow_aggregations: true
update_permissions:
  - role: staff
    permission:
      columns:
        - is_active
      filter: {}
      check: null
delete_permissions:
  - role: staff
    permission:
      filter: {}
```

## Frontend Implementation

### Files to Create

```
apps/admin-ui/src/resources/segment/
├── data/
│   ├── enums.tsx                # Segment type, status enums
│   └── ruleFields.ts            # Available fields for rule builder
├── pages/
│   ├── list/
│   │   ├── index.tsx            # Segment list with DataTable
│   │   └── columns.tsx          # Column definitions with color badges
│   ├── create/
│   │   └── index.tsx            # Create segment form
│   ├── edit/
│   │   └── index.tsx            # Edit segment with rule builder
│   └── show/
│       └── index.tsx            # Show segment with members list
├── components/
│   ├── RuleBuilder.tsx          # Visual rule builder component
│   ├── RuleGroup.tsx            # AND/OR group with nested rules
│   ├── RuleRow.tsx              # Single rule row (field, operator, value)
│   ├── ColorPicker.tsx          # Segment color picker
│   └── MembersList.tsx          # Segment members table
├── lib/
│   └── conditionsToWhere.ts     # Convert rule JSON to Hasura where clause
├── queries.ts                    # GraphQL operations
├── resourceConfig.tsx            # Refine resource config
└── router.tsx                    # Segment routes
```

### Files to Modify

```
apps/admin-ui/src/app/App.tsx
  - Add segmentConfig to resources
  - Add SegmentRouter route

apps/admin-ui/src/app/components/appSidebar/NavMenu.tsx
  - Add "Segments" navigation item with icon
```

### Enums

```tsx
// segment/data/enums.tsx
export const segmentTypes = [
  { label: 'Manual', value: 'manual' },
  { label: 'Rule-based', value: 'rule_based' },
];

export const segmentStatuses = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Archived', value: 'archived' },
];
```

### Rule Builder UI

The rule builder is the most complex UI component. Design:

```
┌─────────────────────────────────────────────────────┐
│ Conditions                           [AND ▼] group  │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [Status     ▼] [equals    ▼] [verified  ▼] [×] │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ [Has Profile▼] [is true   ▼] [          ] [×] │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ ┌── OR group ─────────────────────────────────┐ │ │
│ │ │ [Created At ▼] [after ▼] [2024-01-01] [×] │ │ │
│ │ │ [Department ▼] [equals▼] [Engineering] [×] │ │ │
│ │ │                           [+ Add Rule]      │ │ │
│ │ └─────────────────────────────────────────────┘ │ │
│ │                                                   │ │
│ │ [+ Add Rule]  [+ Add Group]                      │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ Preview: 23 identities match    [Apply Rules]        │
└─────────────────────────────────────────────────────┘
```

#### RuleBuilder Component

Top-level component managing the conditions state:

```tsx
interface RuleBuilderProps {
  value: ConditionGroup;
  onChange: (value: ConditionGroup) => void;
  onPreview?: () => void;
  previewCount?: number;
}
```

#### RuleGroup Component

Recursive component for AND/OR groups:
- Toggle between AND/OR operator
- Render child rules and nested groups
- Add rule / Add group buttons
- Remove group button

Uses shadcn/ui `Card` with subtle border, indented nesting.

#### RuleRow Component

Single condition row:
- Field selector (Select component)
- Operator selector (changes based on field type)
- Value input (text, date picker, select — depends on field)
- Remove button (X icon)

#### ColorPicker Component

Simple color picker using preset colors:
```tsx
const presetColors = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#64748b', // slate
];
```

### conditionsToWhere Utility

Converts rule builder JSON to Hasura `where` clause:

```tsx
// Example: conditions JSON → Hasura where clause
{
  operator: "AND",
  rules: [
    { field: "status", operator: "equals", value: "verified" }
  ]
}
// becomes:
{
  status: { _eq: "verified" }
}

// Nested OR:
{
  operator: "AND",
  rules: [
    { field: "status", operator: "equals", value: "verified" },
    {
      operator: "OR",
      rules: [
        { field: "profile.email", operator: "contains", value: "@company.com" },
        { field: "has_profile", operator: "is_true", value: null }
      ]
    }
  ]
}
// becomes:
{
  _and: [
    { status: { _eq: "verified" } },
    {
      _or: [
        { profile: { email: { _ilike: "%@company.com%" } } },
        { profile_id: { _is_null: false } }
      ]
    }
  ]
}
```

### GraphQL Operations

```graphql
fragment itap_segment on itap_segments {
  id
  created_at
  updated_at
  name
  description
  color
  icon
  segment_type
  conditions
  status
  memberships_aggregate {
    aggregate { count }
  }
}

query SegmentOneQuery($id: uuid!) {
  itap_segments_by_pk(id: $id) {
    ...itap_segment
    memberships(
      where: { is_active: { _eq: true } }
      order_by: { created_at: desc }
      limit: 50
    ) {
      id
      created_at
      identity {
        id
        status
        images
        profile {
          first_name
          last_name
        }
      }
    }
  }
}

# For rule preview — count matching identities
query SegmentPreviewCount($where: itap_identities_bool_exp = {}) {
  itap_identities_aggregate(where: $where) {
    aggregate { count }
  }
}

# For applying rules — fetch matching identity IDs
query SegmentMatchingIdentities($where: itap_identities_bool_exp = {}) {
  itap_identities(where: $where) {
    id
  }
}

# Bulk insert memberships
mutation SegmentAddMembers($objects: [itap_segment_memberships_insert_input!]!) {
  insert_itap_segment_memberships(
    objects: $objects
    on_conflict: {
      constraint: segment_memberships_segment_id_identity_id_key
      update_columns: [is_active]
    }
  ) {
    affected_rows
  }
}

# Remove membership
mutation SegmentRemoveMember($id: uuid!) {
  delete_itap_segment_memberships_by_pk(id: $id) {
    id
  }
}
```

### Key UI Features

#### Segment List Page
- DataTable with columns: Color dot + Name, Type, Status, Members Count, Created At
- Color dot next to name using segment color
- Segment type badge (Manual / Rule-based)
- Member count from aggregate
- Filters: status, type

#### Segment Create Page
- Name, description fields
- Segment type toggle (Manual / Rule-based)
- Color picker
- If rule-based: Rule Builder component appears
- Preview count shown in real-time as rules change

#### Segment Show Page
- Segment details card with color badge
- If rule-based: conditions summary (read-only)
- Members list with:
  - Identity image thumbnail
  - Profile name or "Unknown"
  - Status badge
  - Added date
  - Remove from segment action
- "Apply Rules" button (for rule-based: re-evaluate and sync members)
- "Add Member" button (for manual: opens identity picker modal)

#### Segment Edit Page
- Same as create but pre-populated
- Rule builder pre-filled with existing conditions

### Preset Segment Templates

For demo, offer quick-create templates:

| Template | Type | Conditions |
|----------|------|------------|
| All Verified | rule_based | `status = verified` |
| Unknown Identities | rule_based | `has_profile = false` |
| Recent (7 days) | rule_based | `created_at > last_7_days` |
| VIP List | manual | (empty, add manually) |
| Blacklist | manual | (empty, add manually) |

## Acceptance Criteria

- [ ] `itap.segments` table created via Hasura migration
- [ ] `itap.segment_memberships` table created with unique constraint
- [ ] Hasura metadata with relationships and staff permissions
- [ ] GraphQL codegen runs successfully with new types
- [ ] Segment list page with DataTable, color dots, member counts
- [ ] Segment create page with type selection
- [ ] Rule builder UI works: add/remove rules, add/remove groups, AND/OR toggle
- [ ] Rule preview shows matching identity count
- [ ] "Apply Rules" correctly translates conditions to Hasura where and inserts memberships
- [ ] Segment show page displays members with identity details
- [ ] Manual segment: can add/remove individual members
- [ ] Segment edit page preserves existing conditions
- [ ] Color picker works and color displays in list
- [ ] Navigation sidebar shows Segments link
- [ ] Conditions JSON is correctly stored and loaded
- [ ] Quality gates pass: `pnpm lint`, `pnpm typecheck`
