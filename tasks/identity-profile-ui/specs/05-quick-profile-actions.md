# Spec 05: Quick Profile Actions

## Summary

Add quick actions on the Identity Show page to create a new profile from an identity or link an identity to an existing profile. These are the primary workflows for converting unknown identities into known people.

## Files to Create/Modify

| File | Action |
|------|--------|
| `resources/identity/pages/show/index.tsx` | **Modify** — add action buttons |
| `resources/identity/components/LinkProfileDialog.tsx` | **Create** — profile search & link dialog |
| `resources/identity/queries.ts` | **Modify** — add mutation for linking |

## Actions (shown only when identity has no profile)

### 1. Create Profile

**Button**: "Create Profile" with UserPlus icon

**Behavior**:
- Navigates to `/profiles/create?identityId={id}`
- Pre-fills what we can from identity attributes (name if available)
- After profile creation, automatically links the identity to the new profile via a Hasura mutation:
  ```graphql
  mutation LinkIdentityToProfile($identityId: uuid!, $profileId: uuid!) {
    update_itap_identities_by_pk(
      pk_columns: { id: $identityId }
      _set: { profile_id: $profileId }
    ) { id profile_id }
  }
  ```
- Redirect back to identity show page

**Alternative (simpler)**: Instead of navigating away, show an inline form/dialog:
- Fields: first_name, last_name, email
- On submit: create profile, link identity, refresh page
- This is the preferred approach for demo UX

### 2. Link to Existing Profile

**Button**: "Link to Profile" with Link icon

**Behavior**:
- Opens a dialog/modal with a searchable profile list
- Search by name or email (uses Hasura `_ilike` filter)
- Shows matching profiles with name + email
- Selecting a profile runs the link mutation above
- Closes dialog, refreshes page to show linked profile

**Dialog layout**:
```
+----------------------------------------+
| Link to Profile                    [X] |
|                                        |
| Search: [___________________________] |
|                                        |
| John Doe (john@example.com)      [Link]|
| Jane Smith (jane@example.com)    [Link]|
| ...                                    |
+----------------------------------------+
```

**Search query**:
```graphql
query SearchProfiles($search: String!) {
  itap_profiles(
    where: {
      _or: [
        { first_name: { _ilike: $search } }
        { last_name: { _ilike: $search } }
        { email: { _ilike: $search } }
      ]
    }
    limit: 10
  ) {
    id
    first_name
    last_name
    email
  }
}
```

### 3. Unlink Profile (when profile IS linked)

**Button**: "Unlink Profile" with Unlink icon (shown instead of Create/Link buttons)

**Behavior**:
- Confirm dialog: "Remove link to {profile name}?"
- Runs mutation: `update_itap_identities_by_pk(_set: { profile_id: null })`
- Refreshes page

## Technical Notes

- Use shadcn `Dialog` component for the link dialog
- Use shadcn `Command` (combobox) for profile search if available, otherwise simple input + list
- Mutations go through Hasura directly (no custom backend needed)
- The link mutation is a simple field update on `itap_identities`
- Profile create can use Refine's `useCreate` hook or direct GraphQL mutation
- All actions should show toast notifications on success/failure
