import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';
import { activeDefinitions, keptKeys, valuesOf } from './custom-fields-check';
import { useAttributeDefinitions } from './custom-fields-definitions';
import { formatAttributeValue } from './custom-fields-format';
import type { CustomFieldsMeta } from './custom-fields-meta';

/**
 * The stored values as label and value pairs: active attributes by sort order, then the
 * kept values of inactive or removed attributes under their label or key. Nothing stored
 * reads as a dash.
 */
export function CustomFieldsDisplay(
  props: ScalarDisplayProps<unknown, CustomFieldsMeta>,
): React.ReactElement {
  const t = useT();
  const state = useAttributeDefinitions(props.meta.entity);
  const values = valuesOf(props.value);
  const definitions = state.status === 'ready' ? state.definitions : [];
  const words = { yes: t('console.customFields.yes'), no: t('console.customFields.no') };
  const rows = [
    ...activeDefinitions(definitions)
      .filter((definition) => values[definition.key] !== undefined && values[definition.key] !== null)
      .map((definition) => ({ key: definition.key, label: definition.label, muted: false })),
    ...keptKeys(values, definitions).map(({ key, definition }) => ({
      key,
      label: definition?.label ?? key,
      muted: true,
    })),
  ];
  if (rows.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1" data-testid={props.testIds.display}>
      {rows.map((row) => (
        <div key={row.key} className="contents">
          <dt className={row.muted ? 'text-muted-foreground' : 'font-medium'}>{row.label}</dt>
          <dd>{formatAttributeValue(values[row.key], words)}</dd>
        </div>
      ))}
    </dl>
  );
}
