import { fieldImplementation } from '@burojs/react';
import { EVENT_RULE_PARAMETERS_FIELD } from './event-rule-parameters';
import { EventRuleParametersDisplay } from './event-rule-parameters-display';
import { EventRuleParametersInput } from './event-rule-parameters-input';
import { eventRuleParametersMeta } from './event-rule-parameters-meta';

/** The `itap.event-rule-parameters` input and display, for `composeFieldImplementations`. */
export const eventRuleParametersImplementations = {
  [EVENT_RULE_PARAMETERS_FIELD]: fieldImplementation({
    meta: eventRuleParametersMeta,
    Input: EventRuleParametersInput,
    Display: EventRuleParametersDisplay,
    layout: { size: 'full' },
  }),
};
