# Spec 02: GraphQL Operations & Codegen

## Objective

Create GraphQL queries and mutations for devices, run codegen to generate TypeScript types.

## Dependencies

- Spec 01 (Data Model & Hasura) must be completed first

## Files to Create/Modify

- `apps/admin-ui/src/resources/device/queries.ts` — GraphQL operations
- Run `pnpm gql` in `apps/admin-ui/` to regenerate types

## Implementation Details

### 1. GraphQL Operations

Create `queries.ts` following the pattern from `apps/admin-ui/src/resources/facility/queries.ts`:

```typescript
import { graphql } from '@/shared/api/hasura/@gql';

// List query — paginated, with area relationship
export const DEVICE_LIST_QUERY = graphql(`
  query DeviceList(
    $offset: Int!
    $limit: Int!
    $order_by: [itap_devices_order_by!]
    $where: itap_devices_bool_exp
  ) {
    itap_devices(
      offset: $offset
      limit: $limit
      order_by: $order_by
      where: $where
    ) {
      id
      name
      device_type
      area_id
      stream_url
      resolution
      fps
      status
      health_status
      last_seen
      created_at
      updated_at
      area {
        id
        name
        facility {
          id
          name
        }
      }
    }
    itap_devices_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`);

// Single device query — with health metrics
export const DEVICE_ONE_QUERY = graphql(`
  query DeviceOne($id: uuid!) {
    itap_devices_by_pk(id: $id) {
      id
      name
      device_type
      area_id
      stream_url
      credentials
      resolution
      fps
      status
      health_status
      last_seen
      configuration
      created_at
      updated_at
      area {
        id
        name
        facility {
          id
          name
        }
      }
      health_metrics(order_by: { timestamp: desc }, limit: 20) {
        id
        timestamp
        cpu_usage
        memory_usage
        disk_usage
        network_latency
        frame_rate
        error_count
      }
    }
  }
`);

// Create mutation
export const DEVICE_CREATE_MUTATION = graphql(`
  mutation DeviceCreate($object: itap_devices_insert_input!) {
    insert_itap_devices_one(object: $object) {
      id
    }
  }
`);

// Update mutation
export const DEVICE_UPDATE_MUTATION = graphql(`
  mutation DeviceUpdate($id: uuid!, $object: itap_devices_set_input!) {
    update_itap_devices_by_pk(pk_columns: { id: $id }, _set: $object) {
      id
    }
  }
`);

// Delete mutation
export const DEVICE_DELETE_MUTATION = graphql(`
  mutation DeviceDelete($id: uuid!) {
    delete_itap_devices_by_pk(id: $id) {
      id
    }
  }
`);

// Areas dropdown (for forms — grouped by facility)
export const AREAS_WITH_FACILITY_QUERY = graphql(`
  query AreasWithFacility {
    itap_areas(order_by: { facility: { name: asc } }) {
      id
      name
      facility {
        id
        name
      }
    }
  }
`);
```

### 2. Run Codegen

```bash
cd apps/admin-ui && pnpm gql
```

This generates TypeScript types from the GraphQL schema into `src/shared/api/hasura/@gql/`.

## Acceptance Criteria

- [ ] All GraphQL operations defined and syntactically correct
- [ ] Codegen runs successfully and generates types
- [ ] Types include device fields, area relationships, and health metrics
- [ ] Quality gates pass (pnpm lint, pnpm typecheck)
