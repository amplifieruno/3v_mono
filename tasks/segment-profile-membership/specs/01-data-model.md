# Spec 01: Data Model — segment_profile_memberships

## Summary

Create a new join table `itap.segment_profile_memberships` to link segments directly to profiles, mirroring the existing `segment_memberships` (identity) table design.

## Migration SQL

```sql
CREATE TABLE "itap"."segment_profile_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "segment_id" uuid NOT NULL,
  "profile_id" uuid NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("segment_id") REFERENCES "itap"."segments" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("profile_id") REFERENCES "itap"."profiles" ("id") ON DELETE CASCADE,
  UNIQUE ("segment_id", "profile_id")
);
```

### Design Decisions

- **Separate table** (not adding `profile_id` to existing `segment_memberships`) — keeps the two membership types cleanly separated, avoids nullable FK columns, and doesn't break existing identity membership logic
- **Same columns as `segment_memberships`**: id, created_at, segment_id, profile_id (instead of identity_id), is_active
- **Unique constraint** on (segment_id, profile_id) — same pattern as identity memberships
- **CASCADE deletes** — removing a segment or profile cleans up memberships

## Hasura Metadata

### New table: `itap_segment_profile_memberships.yaml`

```yaml
table:
  name: segment_profile_memberships
  schema: itap
object_relationships:
  - name: segment
    using:
      foreign_key_constraint_on: segment_id
  - name: profile
    using:
      foreign_key_constraint_on: profile_id
insert_permissions:
  - role: staff
    permission:
      check: {}
      columns:
        - segment_id
        - profile_id
        - is_active
select_permissions:
  - role: staff
    permission:
      columns:
        - id
        - created_at
        - segment_id
        - profile_id
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

### Modify: `itap_segments.yaml` — add new array relationship

```yaml
array_relationships:
  - name: memberships          # existing — identity memberships
    using:
      foreign_key_constraint_on:
        column: segment_id
        table:
          name: segment_memberships
          schema: itap
  - name: profile_memberships  # NEW — profile memberships
    using:
      foreign_key_constraint_on:
        column: segment_id
        table:
          name: segment_profile_memberships
          schema: itap
```

### Modify: `itap_profiles.yaml` — add reverse relationship

```yaml
array_relationships:
  - name: identities           # existing
    using:
      foreign_key_constraint_on:
        column: profile_id
        table:
          name: identities
          schema: itap
  - name: segment_memberships  # NEW
    using:
      foreign_key_constraint_on:
        column: profile_id
        table:
          name: segment_profile_memberships
          schema: itap
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/nhost/nhost/migrations/default/<timestamp>_create_segment_profile_memberships/up.sql` | **Create** — migration SQL above |
| `apps/nhost/nhost/migrations/default/<timestamp>_create_segment_profile_memberships/down.sql` | **Create** — `DROP TABLE "itap"."segment_profile_memberships";` |
| `apps/nhost/nhost/metadata/databases/default/tables/itap_segment_profile_memberships.yaml` | **Create** — new table metadata |
| `apps/nhost/nhost/metadata/databases/default/tables/itap_segments.yaml` | **Modify** — add `profile_memberships` relationship |
| `apps/nhost/nhost/metadata/databases/default/tables/itap_profiles.yaml` | **Modify** — add `segment_memberships` relationship |
| `apps/nhost/nhost/metadata/databases/default/tables/tables.yaml` | **Modify** — register new table |

## Verification

After `make hasura_apply`:
- Query `itap_segment_profile_memberships` via GraphQL explorer
- Verify `segments { profile_memberships { profile { first_name } } }` works
- Verify `profiles { segment_memberships { segment { name } } }` works
- Insert a test membership and confirm unique constraint works
