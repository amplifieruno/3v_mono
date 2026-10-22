import { type ScalarInputProps, useT } from '@burojs/react';
import { Button, Checkbox, Label } from '@burojs/ui-shadcn';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type * as React from 'react';
import {
  type WorkspacePanel,
  hiddenPanels,
  movePanel,
  togglePanel,
  workspacePanels,
} from './workspace-panels-format';

/**
 * One row per panel: the shown panels first, in the page's order, each with a box to hide it and
 * buttons to move it up or down; then the hidden ones, each with a box to show it (it joins at
 * the end). Every change writes the whole layout.
 */
export function WorkspacePanelsInput(props: ScalarInputProps<unknown, Record<never, never>>): React.ReactElement {
  const { value, onChange, disabled, readOnly, accessibility, testIds } = props;
  const t = useT();
  const locked = disabled === true || readOnly === true;
  const prefix = accessibility.input ?? 'workspace-panels';
  const shown = workspacePanels(value);
  const label = (panel: WorkspacePanel) => t(`console.workspacePanels.${panel}`);

  const row = (panel: WorkspacePanel, index: number | null) => {
    const id = `${prefix}-${panel}`;
    return (
      <li key={panel} className="flex items-center gap-2">
        <Checkbox
          id={id}
          checked={index !== null}
          disabled={locked}
          onCheckedChange={(checked) => onChange?.(togglePanel(value, panel, checked === true))}
        />
        <Label htmlFor={id} className={index === null ? 'text-muted-foreground' : undefined}>
          {index === null ? label(panel) : `${index + 1}. ${label(panel)}`}
        </Label>
        {index === null || locked ? null : (
          <span className="ml-auto flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={index === 0}
              aria-label={t('console.workspacePanels.up', { params: { panel: label(panel) } })}
              onClick={() => onChange?.(movePanel(value, panel, -1))}
            >
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={index === shown.length - 1}
              aria-label={t('console.workspacePanels.down', { params: { panel: label(panel) } })}
              onClick={() => onChange?.(movePanel(value, panel, 1))}
            >
              <ArrowDown className="size-4" aria-hidden />
            </Button>
          </span>
        )}
      </li>
    );
  };

  return (
    <ul className="flex max-w-md flex-col gap-2" data-testid={testIds.input} aria-describedby={accessibility.description}>
      {shown.map((panel, index) => row(panel, index))}
      {hiddenPanels(value).map((panel) => row(panel, null))}
    </ul>
  );
}
