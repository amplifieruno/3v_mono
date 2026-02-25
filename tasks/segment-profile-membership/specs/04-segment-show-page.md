# Spec 04: Segment Show Page — Profile Members

## Summary

Update the Segment Show page to display both identity members and profile members. Add the ability to manually add/remove profile members.

## Current Show Page Layout

```
+--------------------+--------------------+
| Details            | Members (N)        |
|  Status: active    |  [avatar] John Doe |
|  Type: manual      |    verified        |
|  Description: ...  |  [avatar] Unknown  |
|  Conditions: ...   |    unverified      |
+--------------------+--------------------+
```

## New Layout

```
+--------------------+----------------------------------+
| Details            | Identity Members (N)             |
|  Status: active    |  [avatar] John Doe   [x remove]  |
|  Type: manual/rule |    verified                      |
|  Description: ...  |  [+ Add Identity]                |
|  Conditions: ...   |                                  |
|                    +----------------------------------+
|                    | Profile Members (M)              |
|                    |  [avatar] Jane Smith  [x remove] |
|                    |    jane@company.com              |
|                    |  [avatar] Bob Wilson  [x remove] |
|                    |    bob@company.com               |
|                    |  [+ Add Profile]                 |
+--------------------+----------------------------------+
```

Or use **Tabs** component to switch between Identity Members / Profile Members:

```
+--------------------+----------------------------------+
| Details            | [Identity Members] [Profiles]    |
|  ...               | ─────────────────────────────    |
|                    | Tab content depending on active  |
+--------------------+----------------------------------+
```

**Recommendation:** Use tabs — cleaner, especially when both lists are long. Show combined count in the card title: "Members (N identities, M profiles)".

## Files to Modify

| File | Action |
|------|--------|
| `resources/segment/pages/show/index.tsx` | **Modify** — add profile members tab |
| `resources/segment/components/AddProfileToSegmentDialog.tsx` | **Create** — dialog for manual profile addition |

## AddProfileToSegmentDialog

Reuse the same pattern as `LinkProfileDialog` from identity resource:

- Opens with 5 most recent profiles shown immediately
- Search-as-you-type with OR filter on first_name, last_name, email
- Click "Add" to insert into `segment_profile_memberships`
- Toast on success, refetch query

```typescript
interface AddProfileToSegmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segmentId: string;
  onAdded: () => void;
}
```

## Profile Member Row

Each profile member row shows:
- Avatar with initials (first letter of first_name + last_name)
- Full name as link to `/profiles/show/:id`
- Email below name in muted text
- Remove button (trash icon) — calls `SegmentRemoveProfileMemberMutation`
- Confirmation before removal

## Identity Member Row (update existing)

Current member rows don't link to identity show page. Update to:
- Avatar with face image (from identity.images[0]) instead of just initials
- Name links to `/identities/show/:id`
- If identity has profile, show profile name; otherwise show "Unknown Identity"
- Remove button with confirmation

## Member Count

Card title should show: `Members (3 identities, 5 profiles)` or use tabs with individual counts as badge numbers.

## Data Flow

```
SegmentWithMembersQuery → record.profile_memberships[]
  → each has: id, created_at, profile { id, first_name, last_name, email }
```

Remove profile member:
```
SegmentRemoveProfileMemberMutation(id: membership.id) → refetch
```

Add profile member:
```
SegmentAddProfileMembersMutation(objects: [{ segment_id, profile_id, is_active: true }]) → refetch
```
