import { type ScalarDisplayProps, useOptionalLocale } from '@burojs/react';
import type * as React from 'react';
import { instantOf } from './date-time-format';

/** Date and time of day in the console's locale, `Oct 22, 2026, 09:05`; a dash when empty. */
export function DateTimeDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const locale = useOptionalLocale();
  const at = instantOf(props.value);
  if (at === null) return <span className="text-muted-foreground">—</span>;
  const text = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  return (
    <span className="whitespace-nowrap" data-testid={props.testIds.display}>
      {text}
    </span>
  );
}
