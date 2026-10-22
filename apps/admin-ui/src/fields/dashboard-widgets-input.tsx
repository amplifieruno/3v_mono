import { type ScalarInputProps, useT } from '@burojs/react';
import { Button } from '@burojs/ui-shadcn';
import { Plus } from 'lucide-react';
import type * as React from 'react';
import { MAX_WIDGETS, dashboardProblems } from '../modules/analytics/dashboard-contract';
import { problemKey } from './field-issue';
import { WidgetRow } from './dashboard-widget-row';
import { addWidget, canAdd, rowsInOrder, widgetList } from './dashboard-widgets-format';

/**
 * A dashboard's widgets as a form (`itap.dashboard-widgets`): one block of controls per widget in
 * the dashboard's reading order (its kind, source, settings and place on the grid), "Add widget"
 * below, and every refusal of the database's contract or of a widget's block named on its widget
 * (the same rules the save is refused with). The live preview is the form's `itap:dashboard-grid`.
 */
export function DashboardWidgetsInput(props: ScalarInputProps<unknown, Record<never, never>>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds } = props;
  const t = useT();
  const locked = disabled === true || readOnly === true;
  const prefix = accessibility.input ?? 'dashboard-widgets';
  const problems = dashboardProblems(value ?? []);
  const text = (code: string, params: Readonly<Record<string, string | number>> | undefined) => t(problemKey(code), { params: params ?? {} });
  const listProblems = problems.filter((problem) => problem.index === null);
  const rows = rowsInOrder(value);
  const change = (next: unknown) => {
    onChange?.(next);
    onBlur?.();
  };
  return (
    <div className="flex flex-col gap-3" data-testid={testIds.input} aria-describedby={accessibility.description}>
      {listProblems.length > 0 ? (
        <p className="text-sm text-destructive" role="alert">
          {listProblems.map((problem) => text(problem.code, problem.params)).join(' ')}
        </p>
      ) : null}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('console.dashboardWidgets.none')}</p> : null}
      <ol className="flex flex-col gap-3">
        {rows.map(({ index, widget }, order) => (
          <WidgetRow
            key={index}
            value={value}
            index={index}
            order={order}
            count={rows.length}
            widget={widget}
            problems={problems.filter((problem) => problem.index === index).map((problem) => text(problem.code, problem.params))}
            prefix={prefix}
            locked={locked}
            onChange={change}
          />
        ))}
      </ol>
      {locked ? null : (
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" disabled={!canAdd(value)} onClick={() => change(addWidget(widgetList(value), t('console.dashboardWidgets.newTitle')))}>
            <Plus className="size-4" aria-hidden />
            {t('console.dashboardWidgets.add')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('console.dashboardWidgets.count', { params: { count: widgetList(value).length, max: MAX_WIDGETS } })}</span>
        </div>
      )}
    </div>
  );
}
