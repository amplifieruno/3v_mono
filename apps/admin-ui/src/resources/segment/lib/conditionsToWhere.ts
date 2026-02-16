export interface RuleCondition {
  field: string;
  operator: string;
  value: string | null;
}

export interface RuleGroup {
  operator: 'AND' | 'OR';
  rules: (RuleCondition | RuleGroup)[];
}

export function isRuleGroup(rule: RuleCondition | RuleGroup): rule is RuleGroup {
  return 'rules' in rule;
}

export function createEmptyGroup(): RuleGroup {
  return { operator: 'AND', rules: [] };
}

export function createEmptyRule(): RuleCondition {
  return { field: 'status', operator: 'equals', value: 'verified' };
}

function ruleToWhere(rule: RuleCondition): Record<string, unknown> {
  const { field, operator, value } = rule;

  if (field === 'has_profile') {
    if (operator === 'is_true') {
      return { profile_id: { _is_null: false } };
    }
    return { profile_id: { _is_null: true } };
  }

  if (field === 'created_at') {
    if (operator === 'after') {
      return { created_at: { _gte: value } };
    }
    if (operator === 'before') {
      return { created_at: { _lte: value } };
    }
    if (operator === 'last_n_days') {
      const days = parseInt(value ?? '7', 10);
      const date = new Date();
      date.setDate(date.getDate() - days);
      return { created_at: { _gte: date.toISOString() } };
    }
  }

  // Handle nested profile fields
  if (field.startsWith('profile.')) {
    const profileField = field.replace('profile.', '');
    if (operator === 'is_not_empty') {
      return { profile: { [profileField]: { _is_null: false } } };
    }
    if (operator === 'equals') {
      return { profile: { [profileField]: { _eq: value } } };
    }
    if (operator === 'contains') {
      return { profile: { [profileField]: { _ilike: `%${value}%` } } };
    }
    if (operator === 'not_equals') {
      return { profile: { [profileField]: { _neq: value } } };
    }
  }

  // Direct fields (status, etc.)
  if (operator === 'equals') {
    return { [field]: { _eq: value } };
  }
  if (operator === 'not_equals') {
    return { [field]: { _neq: value } };
  }
  if (operator === 'contains') {
    return { [field]: { _ilike: `%${value}%` } };
  }
  if (operator === 'is_not_empty') {
    return { [field]: { _is_null: false } };
  }

  return {};
}

export function conditionsToWhere(
  group: RuleGroup,
): Record<string, unknown> {
  if (group.rules.length === 0) return {};

  const conditions = group.rules.map((rule) => {
    if (isRuleGroup(rule)) {
      return conditionsToWhere(rule);
    }
    return ruleToWhere(rule);
  });

  if (conditions.length === 1) return conditions[0];

  const key = group.operator === 'AND' ? '_and' : '_or';
  return { [key]: conditions };
}
