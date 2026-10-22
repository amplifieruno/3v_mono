import type { ScalarDisplayProps } from '@burojs/react';
import { Badge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { rowsOfStringList } from './string-list-format';
import type { StringListMeta } from './string-list-meta';

/** The entries side by side, each as an outlined badge; nothing stored reads as a dash. */
export function StringListDisplay(
  props: ScalarDisplayProps<unknown, StringListMeta>,
): React.ReactElement {
  const rows = rowsOfStringList(props.value);
  if (rows.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid={props.testIds.display}>
      {rows.map((row, index) => (
        // Entries are distinct once valid; the position keeps a stored duplicate renderable.
        <Badge key={index} variant="outline">
          {row}
        </Badge>
      ))}
    </span>
  );
}
