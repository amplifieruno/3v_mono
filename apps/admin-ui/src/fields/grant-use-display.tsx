import { type ScalarDisplayProps, useOptionalLocale, useT } from '@burojs/react';
import { Badge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { formatDateTime } from './date-time-format';
import { grantUseState } from './grant-use-state';

/** An access grant's use (`itap.grant-use`): "Used" with the moment, "Unused", or "Reusable". */
export function GrantUseDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  const locale = useOptionalLocale();
  const state = grantUseState(props.value, props.record);
  if (state.kind === 'reusable') {
    return (
      <span className="text-muted-foreground" data-testid={props.testIds.display} data-use="reusable">
        {t('console.grantUse.reusable')}
      </span>
    );
  }
  if (state.kind === 'unused') {
    return (
      <span data-testid={props.testIds.display} data-use="unused">
        <Badge variant="info">{t('console.grantUse.unused')}</Badge>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap" data-testid={props.testIds.display} data-use="used">
      <Badge variant="secondary">{t('console.grantUse.used')}</Badge>
      {formatDateTime(state.at, locale)}
    </span>
  );
}
