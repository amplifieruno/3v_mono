# Spec 01: Data Model & Hasura

## Objective

Add recognition-related columns to `itap_devices` and create an `itap_detections` table for logging face detection events. Configure Hasura metadata with permissions and relationships.

## Dependencies

- Device management must be complete (existing `itap_devices` table)
- `itap_identities` table must exist (for foreign key on detections)

## Files to Create/Modify

### Migrations

- `apps/nhost/nhost/migrations/default/<timestamp>_add_device_recognition_columns/up.sql`
- `apps/nhost/nhost/migrations/default/<timestamp>_add_device_recognition_columns/down.sql`
- `apps/nhost/nhost/migrations/default/<timestamp>_create_itap_detections/up.sql`
- `apps/nhost/nhost/migrations/default/<timestamp>_create_itap_detections/down.sql`

### Hasura Metadata

- `apps/nhost/nhost/metadata/databases/default/tables/itap_devices.yaml` — update permissions for new columns
- `apps/nhost/nhost/metadata/databases/default/tables/itap_detections.yaml` — new table metadata
- `apps/nhost/nhost/metadata/databases/default/tables/tables.yaml` — add detections entry

### Frontend

- `apps/admin-ui/src/resources/device/queries.ts` — add new fields to fragment
- Regenerate GraphQL types: `pnpm gql`

## Implementation Details

### 1. Add Recognition Columns to `itap_devices`

```sql
-- Add recognition control columns
ALTER TABLE "itap"."devices"
  ADD COLUMN "recognition_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN "recognition_fps" integer NOT NULL DEFAULT 2;

-- Add constraint for FPS range
ALTER TABLE "itap"."devices"
  ADD CONSTRAINT "devices_recognition_fps_range"
    CHECK (recognition_fps >= 1 AND recognition_fps <= 5);

-- Index for quickly finding active recognition devices on startup
CREATE INDEX "idx_devices_recognition_enabled"
  ON "itap"."devices" ("recognition_enabled")
  WHERE recognition_enabled = true;
```

**Fields:**

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `recognition_enabled` | boolean | `false` | Whether background recognition is active |
| `recognition_fps` | integer | `2` | Frame capture rate (1-5 fps) |

**Design decisions:**
- `recognition_fps` range 1-5: for a demo, even 1 fps is plenty. Higher = more CPU/API load.
- Partial index on `recognition_enabled = true` — fast startup query to resume active sessions.
- No separate "recognition status" column — the toggle is the source of truth. Runtime status (processing, error) lives in memory on the backend.

### 2. `itap_detections` Table

```sql
CREATE TABLE "itap"."detections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "device_id" uuid NOT NULL,
  "identity_id" uuid,
  "confidence" real NOT NULL,
  "similarity" real,
  "is_new_identity" boolean NOT NULL DEFAULT false,
  "bbox" jsonb,
  "thumbnail" text,
  PRIMARY KEY ("id"),
  CONSTRAINT "detections_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "itap"."devices"("id")
    ON DELETE CASCADE,
  CONSTRAINT "detections_identity_id_fkey"
    FOREIGN KEY ("identity_id") REFERENCES "itap"."identities"("id")
    ON DELETE SET NULL
);

CREATE INDEX "idx_detections_device_id" ON "itap"."detections" ("device_id");
CREATE INDEX "idx_detections_identity_id" ON "itap"."detections" ("identity_id");
CREATE INDEX "idx_detections_created_at" ON "itap"."detections" ("created_at" DESC);
CREATE INDEX "idx_detections_device_created" ON "itap"."detections" ("device_id", "created_at" DESC);
```

**Fields:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `created_at` | timestamptz | When the detection occurred |
| `device_id` | uuid | Which device captured this face |
| `identity_id` | uuid | Matched identity (nullable — detection without match) |
| `confidence` | real | Face detection confidence (0-1) from InsightFace |
| `similarity` | real | Similarity score to matched identity (null if new) |
| `is_new_identity` | boolean | Whether this detection created a new identity |
| `bbox` | jsonb | Bounding box: `{"x_min", "y_min", "x_max", "y_max"}` |
| `thumbnail` | text | Base64-encoded face crop (small, ~150x150 JPEG) |

**Design decisions:**
- `ON DELETE CASCADE` for device — if a device is deleted, its detections go too.
- `ON DELETE SET NULL` for identity — if an identity is merged/deleted, keep the detection record.
- `thumbnail` stored as text (base64) — simple for demo, avoids MinIO complexity for small face crops.
- Composite index on `(device_id, created_at DESC)` — primary query pattern is "recent detections for a device".

### 3. Hasura Metadata — Update `itap_devices.yaml`

Add new columns to existing permissions:

- **select** (`staff`): add `recognition_enabled`, `recognition_fps`
- **insert** (`staff`): add `recognition_enabled`, `recognition_fps`
- **update** (`staff`): add `recognition_enabled`, `recognition_fps`

Add array relationship:
```yaml
- name: detections
  using:
    foreign_key_constraint_on:
      column: device_id
      table:
        name: detections
        schema: itap
```

### 4. Hasura Metadata — New `itap_detections.yaml`

```yaml
table:
  name: detections
  schema: itap

object_relationships:
  - name: device
    using:
      foreign_key_constraint_on: device_id
  - name: identity
    using:
      foreign_key_constraint_on: identity_id

select_permissions:
  - role: staff
    permission:
      columns:
        - id
        - created_at
        - device_id
        - identity_id
        - confidence
        - similarity
        - is_new_identity
        - bbox
        - thumbnail
      filter: {}
      allow_aggregations: true

insert_permissions:
  - role: staff
    permission:
      check: {}
      columns:
        - device_id
        - identity_id
        - confidence
        - similarity
        - is_new_identity
        - bbox
        - thumbnail

delete_permissions:
  - role: staff
    permission:
      filter: {}
```

No update permissions — detections are immutable log records.

### 5. Update `tables.yaml`

Add entry:
```yaml
- "!include itap_detections.yaml"
```

### 6. Update Device Fragment

Add to the `itap_device` fragment in `queries.ts`:
```graphql
recognition_enabled
recognition_fps
```

And add a query for device detections (separate query, not in the fragment — detections are loaded on demand):
```graphql
query DeviceDetectionsQuery($device_id: uuid!, $limit: Int = 50) {
  itap_detections(
    where: { device_id: { _eq: $device_id } }
    order_by: { created_at: desc }
    limit: $limit
  ) {
    id
    created_at
    confidence
    similarity
    is_new_identity
    bbox
    thumbnail
    identity {
      id
      status
      attributes
    }
  }
  itap_detections_aggregate(where: { device_id: { _eq: $device_id } }) {
    aggregate {
      count
    }
  }
}
```

## Acceptance Criteria

- [ ] `recognition_enabled` and `recognition_fps` columns added to `itap_devices`
- [ ] `itap_detections` table created with all fields
- [ ] Foreign keys to `itap_devices` and `itap_identities` work correctly
- [ ] Hasura metadata configured with relationships and permissions
- [ ] Device fragment updated with new fields
- [ ] Detections query created
- [ ] `make hasura_apply` succeeds
- [ ] GraphQL codegen succeeds (`pnpm gql`)
- [ ] Quality gates pass (`pnpm lint`, `pnpm typecheck`)
