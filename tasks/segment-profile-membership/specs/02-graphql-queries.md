# Spec 02: GraphQL Queries & Mutations

## Summary

Update segment GraphQL operations to support profile memberships alongside identity memberships. Add new mutations for adding/removing profile members and queries for matching profiles by rules.

## Files to Modify

| File | Action |
|------|--------|
| `resources/segment/queries.ts` | **Modify** — update existing queries, add new mutations |

## Changes to Existing Queries

### `SegmentWithMembersQuery` — add profile_memberships

```graphql
query SegmentWithMembersQuery($id: uuid!) {
  itap_segments_by_pk(id: $id) {
    ...itap_segment
    # Existing identity memberships
    memberships(where: { is_active: { _eq: true } }, order_by: { created_at: desc }, limit: 100) {
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
    memberships_aggregate(where: { is_active: { _eq: true } }) {
      aggregate { count }
    }
    # NEW: profile memberships
    profile_memberships(where: { is_active: { _eq: true } }, order_by: { created_at: desc }, limit: 100) {
      id
      created_at
      profile {
        id
        first_name
        last_name
        email
      }
    }
    profile_memberships_aggregate(where: { is_active: { _eq: true } }) {
      aggregate { count }
    }
  }
}
```

### `SegmentListQuery` — add profile members count

```graphql
query SegmentListQuery(...) {
  itap_segments(...) {
    ...itap_segment
    memberships_aggregate {
      aggregate { count }
    }
    # NEW
    profile_memberships_aggregate {
      aggregate { count }
    }
  }
  ...
}
```

## New Mutations

### `SegmentAddProfileMembersMutation`

```graphql
mutation SegmentAddProfileMembersMutation($objects: [itap_segment_profile_memberships_insert_input!]!) {
  insert_itap_segment_profile_memberships(
    objects: $objects,
    on_conflict: {
      constraint: segment_profile_memberships_segment_id_profile_id_key,
      update_columns: [is_active]
    }
  ) {
    affected_rows
  }
}
```

### `SegmentRemoveProfileMemberMutation`

```graphql
mutation SegmentRemoveProfileMemberMutation($id: uuid!) {
  delete_itap_segment_profile_memberships_by_pk(id: $id) {
    id
  }
}
```

### `SegmentMatchingProfilesQuery` — for rule-based profile matching

```graphql
query SegmentMatchingProfilesQuery($where: itap_profiles_bool_exp = {}) {
  itap_profiles(where: $where) {
    id
  }
}
```

### `SegmentProfilePreviewCountQuery` — for rule preview

```graphql
query SegmentProfilePreviewCountQuery($where: itap_profiles_bool_exp = {}) {
  itap_profiles_aggregate(where: $where) {
    aggregate { count }
  }
}
```

### `ProfileSearchForSegmentQuery` — for manual profile search in dialog

Reuse existing `ProfileSearchQuery` from identity queries, or add here:

```graphql
query ProfileSearchForSegmentQuery($where: itap_profiles_bool_exp = {}, $limit: Int = 10) {
  itap_profiles(where: $where, limit: $limit, order_by: { first_name: asc }) {
    id
    first_name
    last_name
    email
  }
}
```

## After codegen

Run `cd apps/admin-ui && pnpm gql` to regenerate types after adding these queries.
