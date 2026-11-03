import { z } from 'zod';

/** The `meta` an `eventRuleParameters(...)` field carries (`./event-rule-parameters.ts`). */
export const eventRuleParametersMeta = z.object({
  /** The record field holding the rule type (`rule_type`). */
  typeField: z.string(),
  /** The form value the field reads: buro hands a field only what its refs name. */
  reads: z.array(z.unknown()).optional(),
});

export type EventRuleParametersMeta = z.infer<typeof eventRuleParametersMeta>;
