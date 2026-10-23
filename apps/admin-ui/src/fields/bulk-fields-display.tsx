import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';
import { useEnumLabel } from '../blocks/charts/use-enum-label';
import { BULK_UPDATE_KEY_ENUM } from '../enums/bulk';
import { type BulkText, bulkErrorText, bulkOptionLines } from './bulk-format';

/** `t` with params, as the format helpers take it. */
function useBulkText(): BulkText {
  const t = useT();
  return (key, params) => t(key, params === undefined ? undefined : { params });
}

/** A job's or row's error code as a sentence, the code kept as the hover title. */
export function BulkErrorDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement | null {
  const text = bulkErrorText(props.value, useBulkText());
  if (text === null) return null;
  return (
    <span data-testid={props.testIds.display} data-code={String(props.value)} title={String(props.value)}>
      {text}
    </span>
  );
}

/** A job's options in words, one line each (joined in a list cell). */
export function BulkOptionsDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const keyLabel = useEnumLabel(BULK_UPDATE_KEY_ENUM);
  const lines = bulkOptionLines(props.record?.kind, props.value, useBulkText(), keyLabel);
  if (props.presentation === 'plain') return <span data-testid={props.testIds.display}>{lines.join(' · ')}</span>;
  return (
    <ul data-testid={props.testIds.display} className="flex flex-col gap-0.5 text-sm">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
