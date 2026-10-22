import { type ScalarDisplayProps, useT } from '@burojs/react';
import { TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import { formatWindows, validateWindows } from './time-windows-format';
import type { TimeWindowsMeta } from './time-windows-meta';

/**
 * Windows as compact text (`Mon–Fri 08:00–18:00; Sat 22:00–06:00 (overnight)`). An
 * invalid stored list is flagged next to whatever part of it reads. Plain text in
 * both presentations, so it sits in a list cell or a diff row as is.
 */
export function TimeWindowsDisplay(
  props: ScalarDisplayProps<unknown, TimeWindowsMeta>,
): React.ReactElement {
  const t = useT();
  const { value, testIds, i18n } = props;
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  const text = formatWindows(value, i18n.locale, {
    overnight: t('console.timeWindows.overnight'),
    daily: t('console.timeWindows.daily'),
  });
  const invalid = validateWindows(value) !== null;
  return (
    <span data-testid={testIds.display} data-invalid={invalid || undefined}>
      {text === '' && !invalid ? (
        <span className="text-muted-foreground">{t('console.timeWindows.none')}</span>
      ) : (
        text
      )}
      {invalid ? (
        <span className="ml-1 inline-flex items-center gap-1 text-destructive">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
          {t('console.timeWindows.invalid')}
        </span>
      ) : null}
    </span>
  );
}
