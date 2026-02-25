# Spec 04: Live Detections Enhancements

## Summary

Improve the LiveDetections component on the Device Show page to show real face photos instead of generic icons, and display profile context when available.

## Files to Modify

| File | Action |
|------|--------|
| `resources/device/components/LiveDetections.tsx` | **Modify** — thumbnails, profile info |
| `resources/device/queries.ts` | **Modify** — expand detection query fields |

## Current Behavior

- **Recent Faces strip**: Shows `UserIcon` placeholder for all faces (ignores `thumbnail` field)
- **Detection History table**: Shows `UserIcon` in Face column (same issue)
- **Identity column**: Shows `ID-{6chars}` or "NEW" — no profile context

## Required Changes

### 1. Show Real Face Thumbnails

The `thumbnail` field (base64 JPEG) is already in the Detection data but the `FaceThumbnail` component only renders it when non-null. The issue is that the **socket event** may not include thumbnails, and the **DB query** does include them.

For the DB-sourced detections, thumbnails should already render (verify). For socket detections, the backend currently sends `thumbnail: null` — this is a known limitation (InsightFace doesn't return cropped faces). Keep the UserIcon fallback for these.

**Additionally**: if the identity has `images[]`, use the first image as a better fallback than the generic icon:

```tsx
// Priority: detection.thumbnail > identity.images[0] > UserIcon
const avatarSrc = detection.thumbnail
  ? `data:image/jpeg;base64,${detection.thumbnail}`
  : detection.identity?.images?.[0] || null;
```

This requires fetching `identity.images` in the detection query.

### 2. Profile Badge on Recent Faces

When an identity is linked to a profile, show a visual indicator:

- Small badge or border color change on the face avatar
- Below the identity label, show profile name if available:
  ```
  [Face Photo]
  John Doe        ← profile name (if linked)
  ID-a1b2c3       ← identity ID
  85.3%
  15s ago
  ```
- If no profile: just show identity ID as now

### 3. Profile Name in Detection History Table

Add or modify the Identity column:

```
Identity Column:
  If profile linked:  "John Doe" (with link to /profiles/show/:id)
  Below:              ID-a1b2c3 (with link to /identities/show/:id)

  If no profile:      ID-a1b2c3 (with link to /identities/show/:id)
```

### 4. Expand Detection Query

Current query fetches:
```graphql
identity { id status attributes }
```

Needs to also fetch:
```graphql
identity {
  id
  status
  attributes
  images          # for face photo fallback
  profile_id      # to check if linked
  profile {       # for profile name display
    id
    first_name
    last_name
  }
}
```

Update both:
- `DeviceDetectionsQuery` in `resources/device/queries.ts`
- The socket event handler normalization (profile data won't be in socket events — that's OK, only DB-sourced detections will show profile info)

## Technical Notes

- Don't break the existing socket real-time flow — profile data is only for DB-sourced detections
- The `Detection` interface in LiveDetections.tsx needs to be extended with `identity.images`, `identity.profile_id`, `identity.profile`
- Keep the component under 300 lines — extract `RecentFaceCard` into its own file if needed
- The identity images are URLs (not base64) — use `<img src={url}>` directly
