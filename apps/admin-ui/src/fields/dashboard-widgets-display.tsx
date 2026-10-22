import { type ScalarDisplayProps, useT } from '@burojs/react';
import { Badge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { rowsInOrder } from './dashboard-widgets-format';

/** The widgets by title in reading order, each with its kind; none reads as "No widgets". */
export function DashboardWidgetsDisplay(props: ScalarDisplayProps<unknown, Record<never, never>>): React.ReactElement {
  const t = useT();
  const rows = rowsInOrder(props.value);
  if (rows.length === 0) return <span className="text-muted-foreground">{t('console.dashboardWidgets.none')}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid={props.testIds.display}>
      {rows.map(({ index, widget }) => {
        const row = (widget ?? {}) as Readonly<Record<string, unknown>>;
        const title = typeof row.title === 'string' ? row.title : String(row.id ?? index + 1);
        const kind = typeof row.kind === 'string' ? t(`console.dashboardWidgets.kinds.${row.kind}`) : '';
        return (
          <Badge key={index} variant="outline">
            {kind === '' ? title : `${title} · ${kind}`}
          </Badge>
        );
      })}
    </span>
  );
}
