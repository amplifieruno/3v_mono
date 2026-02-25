# Spec 06: Segment List & Profile Show Updates

## Summary

Update the Segment List page to show combined member counts (identities + profiles). Update the Profile Show page to display which segments a profile belongs to.

## Part A: Segment List — Combined Member Count

### Current

The "Members" column shows `memberships_aggregate.aggregate.count` — only identity members.

### Change

Show combined count: identity members + profile members.

#### Option 1: Two aggregates in query (recommended)

```graphql
itap_segments(...) {
  ...itap_segment
  memberships_aggregate { aggregate { count } }
  profile_memberships_aggregate { aggregate { count } }
}
```

In the column cell, sum both counts:

```typescript
const identityCount = row.original.memberships_aggregate?.aggregate?.count ?? 0;
const profileCount = row.original.profile_memberships_aggregate?.aggregate?.count ?? 0;
const total = identityCount + profileCount;

// Display: "12" or "7 + 5" or with tooltip
return <span>{total}</span>;
```

#### Option 2: Show breakdown

```
12 members (7 identities, 5 profiles)
```

Or in compact form:

```
7 👤 + 5 📋 = 12
```

**Recommendation:** Simple total number in the column, with a tooltip showing breakdown.

### Files to Modify

| File | Action |
|------|--------|
| `resources/segment/queries.ts` | **Modify** — add `profile_memberships_aggregate` to list query |
| `resources/segment/pages/list/columns.tsx` | **Modify** — update Members column to sum both counts |

## Part B: Profile Show Page — Segment Memberships

### Current

Profile Show page shows: header, linked identities, detection history. No segment info.

### Change

Add a "Segments" card showing which segments this profile belongs to.

### Layout

```
+-----------------------------------------------+
| Profile Header (avatar, name, email, dates)   |
+-----------------------------------------------+
| Linked Identities (N)                         |
|  [avatar] [avatar] [avatar]                   |
+--------------------+--------------------------+
| Segments (M)       | Detection History (K)    |
|  🟣 Employees      |  [table...]             |
|  🔵 VIP Clients    |                          |
|  [link to segment] |                          |
+--------------------+--------------------------+
```

Or simpler — add Segments card between Identities and Detection History:

```
+-----------------------------------------------+
| Segments (2)                                  |
|  🟣 Employees          active                 |
|  🔵 Night Shift Staff  active                 |
+-----------------------------------------------+
```

Each segment row:
- Color dot (from segment.color)
- Segment name as link to `/segments/show/:id`
- Status badge

### GraphQL Query Update

Update `ProfileShowQuery` to include segment memberships:

```graphql
query ProfileShowQuery($id: uuid!) {
  itap_profiles_by_pk(id: $id) {
    ...itap_profile
    identities { ... }
    # NEW
    segment_memberships(where: { is_active: { _eq: true } }) {
      id
      segment {
        id
        name
        color
        status
      }
    }
  }
}
```

### Files to Modify

| File | Action |
|------|--------|
| `resources/profile/queries.ts` | **Modify** — add `segment_memberships` to ProfileShowQuery |
| `resources/profile/pages/show/index.tsx` | **Modify** — add Segments card |

## Implementation Order

1. Update `SegmentListQuery` and list columns (quick, isolated change)
2. Update `ProfileShowQuery` and Profile Show page (depends on Spec 01 metadata)
3. Both can be done after Spec 01 (data model) is complete
