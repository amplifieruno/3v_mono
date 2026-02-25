# Spec 03: Rule Builder — Profile Matching

## Summary

Extend the rule builder to support profile-targeted rules. Currently rules only filter identities. We need a way to define rules that match profiles directly (e.g., "email contains @company.com") and apply those rules to add profile members to a segment.

## Design Approach

### Rule Target Concept

Add a `rule_target` field to segments to specify what entity the rules match against:

- `identities` (default, backward-compatible) — existing behavior
- `profiles` — new, rules filter against `itap_profiles` table
- `both` — applies identity rules AND profile rules separately

For simplicity in the demo, use **separate rule sets** stored in the same `conditions` JSONB:

```json
{
  "identity_rules": {
    "operator": "AND",
    "rules": [{ "field": "status", "operator": "equals", "value": "verified" }]
  },
  "profile_rules": {
    "operator": "AND",
    "rules": [{ "field": "email", "operator": "contains", "value": "@company.com" }]
  }
}
```

**Alternative (simpler):** Keep existing `conditions` format for identity rules. Add a new `profile_conditions` JSONB column (default `'{}'`) to store profile rules separately. This avoids changing the existing conditions schema.

**Recommended: New column approach** — cleanest separation, no migration of existing data.

## Database Change

```sql
ALTER TABLE "itap"."segments"
  ADD COLUMN "profile_conditions" jsonb NOT NULL DEFAULT '{}';
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/nhost/nhost/migrations/default/<ts>_add_profile_conditions/up.sql` | **Create** |
| `apps/nhost/nhost/migrations/default/<ts>_add_profile_conditions/down.sql` | **Create** |
| `apps/nhost/nhost/metadata/databases/default/tables/itap_segments.yaml` | **Modify** — add `profile_conditions` to permissions |
| `resources/segment/data/ruleFields.ts` | **Modify** — add profile rule fields |
| `resources/segment/lib/conditionsToWhere.ts` | **Modify** — add `profileConditionsToWhere()` |
| `resources/segment/queries.ts` | **Modify** — update fragment to include `profile_conditions` |
| `resources/segment/pages/create/index.tsx` | **Modify** — add profile rules section |
| `resources/segment/pages/edit/index.tsx` | **Modify** — add profile rules section |

## Profile Rule Fields

New file or extend `ruleFields.ts`:

```typescript
export const profileRuleFields: RuleFieldDef[] = [
  {
    key: 'first_name',
    label: 'First Name',
    type: 'text',
    operators: [
      { value: 'equals', label: 'equals' },
      { value: 'contains', label: 'contains' },
      { value: 'is_not_empty', label: 'is not empty' },
    ],
  },
  {
    key: 'last_name',
    label: 'Last Name',
    type: 'text',
    operators: [
      { value: 'equals', label: 'equals' },
      { value: 'contains', label: 'contains' },
      { value: 'is_not_empty', label: 'is not empty' },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    type: 'text',
    operators: [
      { value: 'equals', label: 'equals' },
      { value: 'contains', label: 'contains' },
      { value: 'is_not_empty', label: 'is not empty' },
    ],
  },
  {
    key: 'created_at',
    label: 'Created At',
    type: 'date',
    operators: [
      { value: 'after', label: 'after' },
      { value: 'before', label: 'before' },
      { value: 'last_n_days', label: 'in the last N days' },
    ],
  },
  {
    key: 'has_identity',
    label: 'Has Linked Identity',
    type: 'boolean',
    operators: [
      { value: 'is_true', label: 'is true' },
      { value: 'is_false', label: 'is false' },
    ],
  },
];
```

## Profile Conditions Converter

New function `profileConditionsToWhere()` in `conditionsToWhere.ts`:

```typescript
// Profile fields map directly to itap_profiles columns (no nesting needed)
// Exception: has_identity → { identities: { } } or aggregate check

function profileRuleToWhere(rule: RuleCondition): Record<string, unknown> {
  const { field, operator, value } = rule;

  if (field === 'has_identity') {
    // Profile has at least one linked identity
    if (operator === 'is_true') {
      return { identities: {} }; // Hasura: exists check
    }
    return { _not: { identities: {} } };
  }

  // Direct fields: first_name, last_name, email, created_at
  // Same operator logic as existing ruleToWhere but without profile. prefix nesting
  ...
}

export function profileConditionsToWhere(group: RuleGroup): Record<string, unknown> {
  // Same logic as conditionsToWhere but using profileRuleToWhere
}
```

## UI: Rule Builder for Profile Rules

In Create/Edit pages, when segment_type is `rule_based`, show **two rule builder sections**:

```
┌─────────────────────────────────────────┐
│ Identity Rules (optional)               │
│ [Existing RuleBuilder component]        │
│ Preview: 42 identities match            │
│ [Apply Identity Rules]                  │
├─────────────────────────────────────────┤
│ Profile Rules (optional)                │
│ [RuleBuilder with profileRuleFields]    │
│ Preview: 15 profiles match              │
│ [Apply Profile Rules]                   │
└─────────────────────────────────────────┘
```

The RuleBuilder component already accepts `fields` as a prop — just pass `profileRuleFields` for the profile section and `ruleFields` for the identity section.

## Apply Rules Flow

When "Apply Profile Rules" is clicked:

1. Convert profile_conditions to Hasura where clause via `profileConditionsToWhere()`
2. Query `SegmentMatchingProfilesQuery` with the where clause
3. Bulk insert into `segment_profile_memberships` via `SegmentAddProfileMembersMutation`
4. Show toast with count of matched profiles

Same flow as existing identity rule application, just targeting profiles table.
