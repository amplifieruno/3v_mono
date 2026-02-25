# Identity & Profile UI Improvements

## Goal

Improve the Identity and Profile screens to make them usable for demo purposes. Currently these screens are basic CRUD forms — they need proper Show (detail) pages with visual data, cross-navigation between related entities, and quick actions for linking identities to profiles.

## Current State

### Identity
- **List page**: Works, shows ID, images (overlapping avatars), status, profile link, attributes. But clicking into an identity only goes to Edit — no Show page.
- **Edit page**: Form with status dropdown, profile selector, image URLs (text input), attributes (JSON input shows `[object Object]`).
- **Show page**: Route configured in resourceConfig but **not implemented** — returns 404. LiveDetections links to `/identities/show/:id` which is broken.

### Profile
- **List page**: Works, shows first_name, last_name, email, actions.
- **Edit page**: Form with name/email fields + "Create Face ID" button (FaceScannerModal).
- **Show page**: Route configured but **not implemented**.

### LiveDetections (Device Show page)
- Recent Faces strip shows generic user icon (no actual face photo even when `thumbnail` is available in detection data).
- Identity column shows `ID-{6chars}` with no profile context.
- No indication whether an identity is linked to a profile.

## Data Model (relevant)

```
itap_profiles (1) --< itap_identities (many)
  profile_id FK on identities

itap_identities (1) --< itap_detections (many)
  identity_id FK on detections

itap_detections >-- itap_devices (many-to-1)
  device_id FK on detections
```

Key fields:
- `identities.images`: `text[]` — array of image URLs
- `identities.attributes`: `jsonb` — arbitrary key-value pairs
- `identities.profile_id`: FK to profiles
- `detections.thumbnail`: `text` — base64 JPEG of detected face
- `detections.device_id`: FK to devices

## Scope

1. **Identity Show page** — new page with photos, attributes, detection history, linked profile info
2. **Identity List improvements** — clickable ID/photo to navigate to Show page
3. **Profile Show page** — new page with linked identities, detection history across all identities
4. **LiveDetections enhancements** — show real face photos, profile badge, profile name
5. **Quick Profile actions** — create profile from identity, link identity to existing profile

## Out of Scope

- Changes to the face recognition backend
- New database migrations (all needed relationships already exist)
- Identity/Profile deletion workflows
- Bulk operations
