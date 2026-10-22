import { type ScalarDisplayProps, useT } from '@burojs/react';
import { Badge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { workspacePanels } from './workspace-panels-format';

/** The shown panels in order, each as an outlined badge; none shown reads as "No panels". */
export function WorkspacePanelsDisplay(props: ScalarDisplayProps<unknown, Record<never, never>>): React.ReactElement {
  const t = useT();
  const panels = workspacePanels(props.value);
  if (panels.length === 0) return <span className="text-muted-foreground">{t('console.workspacePanels.none')}</span>;
  return (
    <span className="inline-flex flex-wrap gap-1" data-testid={props.testIds.display}>
      {panels.map((panel, index) => (
        <Badge key={panel} variant="outline">
          {`${index + 1}. ${t(`console.workspacePanels.${panel}`)}`}
        </Badge>
      ))}
    </span>
  );
}
