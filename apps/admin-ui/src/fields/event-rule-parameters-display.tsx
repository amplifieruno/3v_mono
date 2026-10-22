import type { ScalarDisplayProps } from '@burojs/react';
import type * as React from 'react';
import { NO_PARAMETERS_NOTE, describeParameters, ruleTypeOf } from './event-rule-parameters-format';
import type { EventRuleParametersMeta } from './event-rule-parameters-meta';

/** The parameters as label and value pairs; for a type without parameters, where its thresholds come from. */
export function EventRuleParametersDisplay(
  props: ScalarDisplayProps<unknown, EventRuleParametersMeta>,
): React.ReactElement {
  const type = ruleTypeOf(props, props.meta.typeField);
  const rows = describeParameters(props.value, type);
  if (rows.length === 0) {
    const note = type === undefined ? undefined : NO_PARAMETERS_NOTE[type];
    return <span className="text-muted-foreground">{note ?? '—'}</span>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid={props.testIds.display}>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd>{row.text}</dd>
        </div>
      ))}
    </dl>
  );
}
