export interface RuleFieldDef {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'boolean';
  operators: { value: string; label: string }[];
  options?: { value: string; label: string }[];
}

export const ruleFields: RuleFieldDef[] = [
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    operators: [
      { value: 'equals', label: 'equals' },
      { value: 'not_equals', label: 'not equals' },
    ],
    options: [
      { value: 'verified', label: 'Verified' },
      { value: 'unverified', label: 'Unverified' },
    ],
  },
  {
    key: 'has_profile',
    label: 'Has Profile',
    type: 'boolean',
    operators: [
      { value: 'is_true', label: 'is true' },
      { value: 'is_false', label: 'is false' },
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
    key: 'profile.first_name',
    label: 'First Name',
    type: 'text',
    operators: [
      { value: 'equals', label: 'equals' },
      { value: 'contains', label: 'contains' },
      { value: 'is_not_empty', label: 'is not empty' },
    ],
  },
  {
    key: 'profile.last_name',
    label: 'Last Name',
    type: 'text',
    operators: [
      { value: 'equals', label: 'equals' },
      { value: 'contains', label: 'contains' },
      { value: 'is_not_empty', label: 'is not empty' },
    ],
  },
  {
    key: 'profile.email',
    label: 'Email',
    type: 'text',
    operators: [
      { value: 'equals', label: 'equals' },
      { value: 'contains', label: 'contains' },
      { value: 'is_not_empty', label: 'is not empty' },
    ],
  },
];

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
