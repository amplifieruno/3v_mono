import type { ScalarDisplayProps } from '@burojs/react';
import type * as React from 'react';
import { describeActivity } from './incident-activity-details-format';

/** The activity's details in one line (`./incident-activity-details-format.ts`). */
export function IncidentActivityDetailsDisplay(
  props: ScalarDisplayProps<unknown, { readonly kindField: string }>,
): React.ReactElement {
  const text = describeActivity(props.record?.[props.meta.kindField], props.value);
  return (
    <span className={text === '' ? 'text-muted-foreground' : 'text-sm'} data-testid={props.testIds.display}>
      {text === '' ? '—' : text}
    </span>
  );
}
