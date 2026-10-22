import { type ScalarDisplayProps, useOptionalLocale } from '@burojs/react';
import type * as React from 'react';
import { formatDateTime, instantOf } from './date-time-format';

/**
 * Date and time of day in the console's locale, `Oct 22, 2026, 09:05`; a dash when empty. The
 * `plain` presentation (a diff row, a tooltip, a dense cell) drops the display's own styling:
 * no muted dash, no forced single line.
 */
export function DateTimeDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const locale = useOptionalLocale();
  const plain = props.presentation === 'plain';
  const at = instantOf(props.value);
  if (at === null) {
    return (
      <span className={plain ? undefined : 'text-muted-foreground'} data-testid={props.testIds.display}>
        —
      </span>
    );
  }
  return (
    <span className={plain ? undefined : 'whitespace-nowrap'} data-testid={props.testIds.display}>
      {formatDateTime(at, locale)}
    </span>
  );
}
