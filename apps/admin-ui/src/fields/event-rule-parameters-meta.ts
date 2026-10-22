import { z } from 'zod';

/** The `meta` an `eventRuleParameters(...)` field carries (`./event-rule-parameters.ts`). */
export const eventRuleParametersMeta = z.object({
  /** The record field holding the rule type (`rule_type`). */
  typeField: z.string(),
});

export type EventRuleParametersMeta = z.infer<typeof eventRuleParametersMeta>;
