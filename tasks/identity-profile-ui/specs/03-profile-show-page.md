# Spec 03: Profile Show Page

## Summary

Create a new Profile Show page at `/profiles/show/:id`. Display profile info, linked identities with their photos, and a combined detection history across all identities.

## Files to Create/Modify

| File | Action |
|------|--------|
| `resources/profile/pages/show/index.tsx` | **Create** — new Show page |
| `resources/profile/router.tsx` | **Modify** — add show route |
| `resources/profile/queries.ts` | **Modify** — add Show query with identities + detections |

## Layout

```
+-------------------------------------------+---------------------------+
| Profile Header                                                        |
| Avatar (first identity photo or initials) | Name, Email               |
|                                           | Created / Updated dates   |
|                                           | [Edit] button             |
+-------------------------------------------+---------------------------+
| Linked Identities (full-width)                                        |
| Horizontal scroll of identity cards:                                  |
| [photo] [photo] [photo]  ...                                         |
| status   status  status                                               |
| Each card links to /identities/show/:id                              |
+-----------------------------------------------------------------------+
| Detection History (full-width table)                                  |
| Time | Device | Identity | Confidence | Similarity | Face            |
| Aggregated across ALL linked identities                              |
| Device names link to /devices/show/:id                               |
+-----------------------------------------------------------------------+
```

## GraphQL Query

```graphql
query ProfileOne($id: uuid!) {
  itap_profiles_by_pk(id: $id) {
    id
    created_at
    updated_at
    first_name
    last_name
    email
    identities(order_by: { created_at: desc }) {
      id
      images
      status
      attributes
      detections(order_by: { created_at: desc }, limit: 20) {
        id
        created_at
        confidence
        similarity
        thumbnail
        device {
          id
          name
        }
      }
    }
  }
}
```

## Linked Identities Section

- Horizontal scroll strip (same pattern as RecentFaces in LiveDetections)
- Each identity card shows:
  - First image from `images[]` array (or UserIcon placeholder)
  - Status badge (verified / unverified)
  - `ID-{6chars}` label
- Clicking a card navigates to `/identities/show/:id`

## Detection History Table

- Flatten detections from all linked identities into one list
- Sort by `created_at` desc
- Columns: Time, Device (link), Identity (link + mini avatar), Confidence, Face thumbnail
- Limit to 50 most recent

## Profile Header

- Large avatar: use first image from first identity, or initials fallback
- Display: full name, email
- Created/Updated dates
- Edit button → `/profiles/edit/:id`

## Technical Notes

- Profile queries currently don't fetch identities — need to add the relationship
- Hasura already has the relationship (identities.profile_id → profiles.id)
- The reverse relationship (profile → identities) needs to be in Hasura metadata (array relationship) — verify it exists, add if not
- Follow same layout patterns as Device Show page
- Also add Show link/button to Profile list page (same as spec 02 for identities)
