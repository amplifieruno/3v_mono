# Spec 05: Segment Create/Edit — Profile Support

## Summary

Update Create and Edit pages to support profile membership alongside identity membership. For manual segments, allow adding profiles during creation. For rule-based segments, support separate profile rules.

## Current Create Page

```
Name: [___________]
Description: [___________]
Color: [picker]
Type: [Manual ▼]     Status: [Active ▼]

(if rule_based:)
┌─────────────────────────────┐
│ Rule Builder                │
│ [field] [operator] [value]  │
│ [+ Add Rule] [+ Add Group]  │
│ Preview: 42 match  [Apply]  │
└─────────────────────────────┘
```

## Updated Create Page (rule_based)

```
Name: [___________]
Description: [___________]
Color: [picker]
Type: [Rule-based ▼]   Status: [Active ▼]

Identity Rules (optional)
┌─────────────────────────────────────────┐
│ [field ▼] [operator ▼] [value]  [x]    │
│ [+ Add Rule] [+ Add Group]             │
│ Preview: 42 identities match            │
└─────────────────────────────────────────┘

Profile Rules (optional)
┌─────────────────────────────────────────┐
│ [field ▼] [operator ▼] [value]  [x]    │
│ [+ Add Rule] [+ Add Group]             │
│ Preview: 15 profiles match              │
└─────────────────────────────────────────┘
```

Both rule sections are optional — a segment can have only identity rules, only profile rules, or both.

## Updated Create Page (manual)

For manual segments, rule builders are hidden. Members are added after creation from the Show page (via "Add Profile" / "Add Identity" dialogs). No changes needed to the create form for manual type.

## Files to Modify

| File | Action |
|------|--------|
| `resources/segment/pages/create/index.tsx` | **Modify** — add profile rules section |
| `resources/segment/pages/edit/index.tsx` | **Modify** — add profile rules section, load profile_conditions |
| `resources/segment/queries.ts` | **Modify** — fragment includes `profile_conditions` |
| `resources/segment/components/RuleBuilder.tsx` | **No change** — already accepts `fields` prop |

## Create Flow (rule_based)

1. User fills name, description, color, selects "Rule-based"
2. User optionally defines identity rules in first RuleBuilder
3. User optionally defines profile rules in second RuleBuilder
4. User clicks Preview on either section → shows count of matching entities
5. User clicks Save → creates segment with:
   - `conditions`: identity rules JSON (existing field)
   - `profile_conditions`: profile rules JSON (new field)
6. After segment created, user clicks "Apply Rules" on Show page to populate memberships

## Edit Flow

1. Load segment with both `conditions` and `profile_conditions`
2. Initialize both RuleBuilders with saved conditions
3. Same editing experience as Create
4. On save, update both conditions fields
5. "Apply Rules" button re-evaluates and updates memberships

## Preview Count

Each rule section has its own preview:

```typescript
// Identity preview
const identityWhere = conditionsToWhere(identityConditions);
const { data } = await gqlClient.request({
  document: SegmentPreviewCountQuery,
  variables: { where: identityWhere },
});

// Profile preview
const profileWhere = profileConditionsToWhere(profileConditions);
const { data } = await gqlClient.request({
  document: SegmentProfilePreviewCountQuery,
  variables: { where: profileWhere },
});
```

## Apply Rules (on Show page)

Two separate "Apply" actions:

1. **Apply Identity Rules** — existing logic, queries identities → inserts into segment_memberships
2. **Apply Profile Rules** — new logic, queries profiles → inserts into segment_profile_memberships

Both can be triggered independently or via a single "Apply All Rules" button.
