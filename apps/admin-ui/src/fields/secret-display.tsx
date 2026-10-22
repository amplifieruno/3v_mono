import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';

/** A write-only secret is never read back: the display says so instead of a value. */
export function SecretDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  return (
    <span className="text-muted-foreground" data-testid={props.testIds.display}>
      {t('console.secret.hidden')}
    </span>
  );
}
