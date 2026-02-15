---
paths:
  - "**/nhost/**"
  - "**/migrations/**"
  - "**/metadata/**"
---

# Hasura and Database Conventions

## Data Access

- All data access goes through Hasura GraphQL. Never query PostgreSQL directly from application code.
- Use Hasura's generated GraphQL API as the single source of truth for CRUD operations.
- For complex business logic that cannot be expressed as Hasura actions, use custom Express handlers that are called via Hasura Actions or Events.

## Schema Management

- Manage database schema changes through the Hasura console.
- Always export Hasura metadata to git after making changes in the console.
- Never hand-edit metadata YAML files unless you fully understand the structure.

## Migrations

- Migration file naming: `{timestamp}_{description}` (e.g., `1707000000000_create_identities_table`).
- Each migration must be reversible -- include both `up.sql` and `down.sql`.
- One logical change per migration. Do not bundle unrelated schema changes.
- Test migrations locally before committing.

## Permissions

- Define all row-level and column-level permissions in Hasura metadata.
- Never implement permission checks in application code that duplicate what Hasura handles.
- Use Hasura roles to model access levels (e.g., `admin`, `user`, `viewer`).
- Use session variables (`x-hasura-user-id`, `x-hasura-role`) for permission filters.

## Relationships

- Define relationships (object and array) in Hasura metadata for all foreign key associations.
- Use Hasura relationships for joins. Never write manual JOIN queries in application code.
- Name relationships clearly: singular for object relationships, plural for array relationships (e.g., `profile` vs `identities`).

## GraphQL Operations

- Use `graphql-codegen` to generate TypeScript types from the Hasura schema.
- Never write GraphQL response types by hand.
- Organize operations in `.graphql` files, co-located with the features that use them.
- Use fragments for reusable field selections.

## Naming Conventions

- Database tables: `snake_case`, plural (e.g., `identities`, `facility_areas`).
- Database columns: `snake_case` (e.g., `created_at`, `facility_id`).
- Enum types: `snake_case` for the type, `UPPER_SNAKE_CASE` for values.
- GraphQL queries/mutations: `camelCase` (e.g., `getIdentities`, `createProfile`).

## Nhost Integration

- Use Nhost SDK for authentication and file storage.
- Nhost manages the Hasura instance -- do not configure Hasura independently of Nhost.
- Store uploaded images (face scans, profile photos) in Nhost Storage, reference by file ID in the database.
