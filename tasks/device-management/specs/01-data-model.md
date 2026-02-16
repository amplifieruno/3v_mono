# Spec 01: Data Model & Hasura

## Objective

Create the database tables for devices and device health metrics, configure Hasura metadata with permissions and relationships.

## Files to Create/Modify

### Migrations

- `apps/nhost/nhost/migrations/default/<timestamp>_create_itap_devices/up.sql`
- `apps/nhost/nhost/migrations/default/<timestamp>_create_itap_devices/down.sql`
- `apps/nhost/nhost/migrations/default/<timestamp>_create_itap_device_health_metrics/up.sql`
- `apps/nhost/nhost/migrations/default/<timestamp>_create_itap_device_health_metrics/down.sql`

### Hasura Metadata

- `apps/nhost/nhost/metadata/databases/default/tables/itap_devices.yaml`
- `apps/nhost/nhost/metadata/databases/default/tables/itap_device_health_metrics.yaml`
- `apps/nhost/nhost/metadata/databases/default/tables/tables.yaml` — add new table entries
- `apps/nhost/nhost/metadata/databases/default/tables/itap_areas.yaml` — add array relationship to devices

## Implementation Details

### 1. `itap_devices` Table

```sql
CREATE TABLE "itap"."devices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "name" text NOT NULL,
  "device_type" text NOT NULL DEFAULT 'static_video_camera',
  "area_id" uuid NOT NULL,
  "stream_url" text,
  "credentials" jsonb DEFAULT '{}',
  "resolution" text DEFAULT '1920x1080',
  "fps" integer DEFAULT 30,
  "status" text NOT NULL DEFAULT 'inactive',
  "health_status" text NOT NULL DEFAULT 'unknown',
  "last_seen" timestamptz,
  "configuration" jsonb DEFAULT '{}',
  PRIMARY KEY ("id"),
  CONSTRAINT "devices_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "itap"."areas"("id")
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX "idx_devices_area_id" ON "itap"."devices" ("area_id");
CREATE INDEX "idx_devices_status" ON "itap"."devices" ("status");
CREATE INDEX "idx_devices_device_type" ON "itap"."devices" ("device_type");

-- Trigger for updated_at (reuse existing function if available, or create)
CREATE TRIGGER "set_itap_devices_updated_at"
  BEFORE UPDATE ON "itap"."devices"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."set_current_timestamp_updated_at"();
```

**Enums (enforced via CHECK or application-level, not DB enums for flexibility):**

- `device_type`: `static_video_camera`, `ptz_camera`, `sensor`
- `status`: `active`, `inactive`, `error`, `maintenance`
- `health_status`: `healthy`, `warning`, `critical`, `unknown`

**Design decisions:**
- `stream_url` is nullable — a device can be registered before the stream is configured
- `credentials` is JSONB — flexible for different auth methods (username/password, token, etc.)
- `configuration` is JSONB — device-specific settings (e.g., motion sensitivity, recording schedule)
- ON DELETE RESTRICT for area — don't allow deleting areas that have devices

### 2. `itap_device_health_metrics` Table

```sql
CREATE TABLE "itap"."device_health_metrics" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "device_id" uuid NOT NULL,
  "timestamp" timestamptz NOT NULL DEFAULT now(),
  "cpu_usage" real,
  "memory_usage" real,
  "disk_usage" real,
  "network_latency" real,
  "frame_rate" real,
  "error_count" integer DEFAULT 0,
  PRIMARY KEY ("id"),
  CONSTRAINT "device_health_metrics_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "itap"."devices"("id")
    ON DELETE CASCADE
);

CREATE INDEX "idx_device_health_metrics_device_id" ON "itap"."device_health_metrics" ("device_id");
CREATE INDEX "idx_device_health_metrics_timestamp" ON "itap"."device_health_metrics" ("timestamp" DESC);
```

### 3. Hasura Metadata — `itap_devices.yaml`

Follow the pattern from `itap_facilities.yaml` and `itap_areas.yaml`:

- **Object relationship**: `area` → `itap_areas` via `area_id`
- **Array relationship**: `health_metrics` → `itap_device_health_metrics` via `device_id`
- **Permissions** for `staff` role:
  - `select`: all columns
  - `insert`: all columns except `id`, `created_at`, `updated_at`
  - `update`: all columns except `id`, `created_at`, `updated_at`
  - `delete`: filter `{}`

### 4. Hasura Metadata — `itap_device_health_metrics.yaml`

- **Object relationship**: `device` → `itap_devices` via `device_id`
- **Permissions** for `staff` role:
  - `select`: all columns
  - `insert`: all columns except `id` (for backend health reporting)
  - No update/delete needed (metrics are append-only)

### 5. Update `itap_areas.yaml`

Add array relationship:
- `devices` → `itap_devices` via `area_id`

### 6. Update `tables.yaml`

Add entries for both new tables.

## Acceptance Criteria

- [ ] `itap_devices` table created with all fields from the functional spec
- [ ] `itap_device_health_metrics` table created with proper foreign key
- [ ] Hasura metadata configured with relationships and permissions
- [ ] `make hasura_apply` succeeds
- [ ] Can perform CRUD via Hasura console/API
- [ ] Quality gates pass (pnpm lint, pnpm typecheck)
