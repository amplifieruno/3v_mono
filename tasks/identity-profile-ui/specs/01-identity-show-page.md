# Spec 01: Identity Show Page

## Summary

Create a new Identity Show (detail) page at `/identities/show/:id`. Currently only Edit exists — the Show route is configured but not implemented, and LiveDetections already links to it (returns 404).

## Files to Create/Modify

| File | Action |
|------|--------|
| `resources/identity/pages/show/index.tsx` | **Create** — new Show page |
| `resources/identity/router.tsx` | **Modify** — add show route |
| `resources/identity/queries.ts` | **Modify** — add Show query with detections |

## Layout (lg+ two-column)

```
+-------------------------------------------+---------------------------+
| Identity Photos                           | Details Card              |
| [photo grid — all images from images[]]   |  Status: verified/unverif |
|                                           |  Profile: John Doe (link) |
|                                           |    or "Not linked"        |
|                                           |  Created: date            |
|                                           |  Updated: date            |
|                                           |                           |
|                                           | Attributes Card           |
|                                           |  key: value               |
|                                           |  key: value               |
|                                           |  (parsed from JSONB)      |
|                                           |                           |
|                                           | Actions Card              |
|                                           |  [Edit] [Create Profile]  |
|                                           |  [Link to Profile]        |
+-------------------------------------------+---------------------------+
| Detection History (full-width table)                                  |
| Time | Device | Confidence | Similarity | Thumbnail                  |
| Device names are links to /devices/show/:id                          |
+-----------------------------------------------------------------------+
```

## GraphQL Query

```graphql
query IdentityOne($id: uuid!) {
  itap_identities_by_pk(id: $id) {
    id
    created_at
    updated_at
    images
    status
    attributes
    profile_id
    profile {
      id
      first_name
      last_name
      email
    }
    detections(order_by: { created_at: desc }, limit: 50) {
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
```

## Photo Grid

- Display all URLs from `images[]` array as a responsive grid
- Use `aspect-square` thumbnails with `object-cover`
- Clicking a photo opens it full-size (or just enlarges in-place)
- If no images, show a large placeholder with UserIcon

## Attributes Display

- Parse `attributes` JSONB into key-value pairs
- Render as a simple list: `label: value`
- Handle nested objects by JSON.stringify-ing them
- Skip empty/null values

## Detection History Table

Columns: Time, Device, Confidence, Similarity, Face

- **Time**: `toLocaleString()`
- **Device**: device name as link to `/devices/show/:deviceId`
- **Confidence**: percentage format
- **Similarity**: percentage or "—"
- **Face**: small avatar with base64 thumbnail

## Quick Actions (see also spec 05)

- **Edit** button → navigates to `/identities/edit/:id`
- **Create Profile** button → only shown if `profile_id` is null (see spec 05)
- **Link to Profile** button → only shown if `profile_id` is null (see spec 05)

## Technical Notes

- Follow the same pattern as Device Show page (useShow + meta gqlQuery)
- Identity images are external URLs (not base64) — use `<img>` directly
- Detection thumbnails are base64 — use `data:image/jpeg;base64,...`
- Router already has show path in resourceConfig, just needs the route + component
