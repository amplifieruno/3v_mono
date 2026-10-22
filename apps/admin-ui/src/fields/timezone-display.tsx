import { type ScalarDisplayProps, useT } from '@burojs/react';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { timezoneOffset } from './timezone-zones';

/**
 * A zone with its current offset, `Europe/Moscow (UTC+03:00)`. A zone the browser
 * does not know keeps its stored text and is flagged, never shown as UTC.
 */
export function TimezoneDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  const { value, testIds } = props;
  if (typeof value !== 'string' || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  const offset = timezoneOffset(value);
  if (offset === null) {
    return (
      <span
        className="inline-flex items-center gap-1 text-destructive"
        data-testid={testIds.display}
        data-invalid="true"
      >
        <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
        {value} — {t('console.timezone.unknown')}
      </span>
    );
  }
  return (
    <span data-testid={testIds.display}>
      {value} <span className="text-muted-foreground">({offset})</span>
    </span>
  );
}
