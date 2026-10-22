import { useT } from '@burojs/react';
import { Button, Input, Label } from '@burojs/ui-shadcn';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import type * as React from 'react';
import { POSITION_RANGES, type PositionAxis } from '../modules/analytics/dashboard-contract';
import type { DashboardWidgetKind } from '../modules/analytics/widget-blocks';
import { ParamControlInput } from './dashboard-param-control';
import { ParamSelect } from './dashboard-param-select';
import { WIDGET_PARAMS, otherParams } from './dashboard-widget-params-catalog';
import {
  WIDGET_KINDS,
  entriesOf,
  entryOfWidget,
  moveWidget,
  removeWidget,
  setKind,
  setParam,
  setPosition,
  setSource,
  setTitle,
} from './dashboard-widgets-format';

export interface WidgetRowProps {
  readonly value: unknown;
  /** The widget's place in the stored list. */
  readonly index: number;
  /** Its place in the dashboard's reading order (what the editor numbers). */
  readonly order: number;
  readonly count: number;
  readonly widget: unknown;
  readonly problems: readonly string[];
  readonly prefix: string;
  readonly locked: boolean;
  readonly onChange: (next: unknown) => void;
}

const asRow = (value: unknown): Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Readonly<Record<string, unknown>>) : {};

const AXES: readonly PositionAxis[] = ['x', 'y', 'w', 'h'];

/**
 * One widget in the dashboard editor: its title, kind and source (the query it reads), its
 * settings by source, its place on the grid (column, row, width, height), buttons to move it
 * earlier or later and to remove it, and what the contract or its block refuses in it.
 */
export function WidgetRow({ value, index, order, count, widget, problems, prefix, locked, onChange }: WidgetRowProps): React.ReactElement {
  const t = useT();
  const row = asRow(widget);
  const kind = typeof row.kind === 'string' ? row.kind : '';
  const entry = entryOfWidget(widget);
  const params = asRow(row.params);
  const position = asRow(row.position);
  const id = `${prefix}-${index}`;
  const name = typeof row.title === 'string' && row.title.trim() !== '' ? row.title : t('console.dashboardWidgets.untitled', { params: { position: order + 1 } });
  const kinds = WIDGET_KINDS as readonly string[];
  const others = entry === null ? [] : otherParams(entry, params);
  const field = (key: string, label: string, control: React.ReactNode) => (
    <div key={key} className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={`${id}-${key}`} className="text-xs">
        {label}
      </Label>
      {control}
    </div>
  );
  return (
    <li data-testid="dashboard-widget-row" className="flex flex-col gap-3 rounded-md border p-3" aria-label={name} aria-describedby={problems.length > 0 ? `${id}-problems` : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{`${order + 1}. ${name}`}</span>
        {locked ? null : (
          <span className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="sm" disabled={order === 0} aria-label={t('console.dashboardWidgets.up', { params: { name } })} onClick={() => onChange(moveWidget(value, index, -1))}>
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={order === count - 1} aria-label={t('console.dashboardWidgets.down', { params: { name } })} onClick={() => onChange(moveWidget(value, index, 1))}>
              <ArrowDown className="size-4" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="sm" aria-label={t('console.dashboardWidgets.remove', { params: { name } })} onClick={() => onChange(removeWidget(value, index))}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </span>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {field('title', t('console.dashboardWidgets.title'), <Input id={`${id}-title`} value={typeof row.title === 'string' ? row.title : ''} disabled={locked} onChange={(event) => onChange(setTitle(value, index, event.target.value))} />)}
        {field(
          'kind',
          t('console.dashboardWidgets.kind'),
          <ParamSelect
            id={`${id}-kind`}
            value={kind}
            disabled={locked}
            options={kinds.map((option) => ({ value: option, label: t(`console.dashboardWidgets.kinds.${option}`) }))}
            onChange={(next) => onChange(setKind(value, index, next as DashboardWidgetKind))}
          />,
        )}
        {kinds.includes(kind)
          ? field(
              'source',
              t('console.dashboardWidgets.source'),
              <ParamSelect
                id={`${id}-source`}
                value={entry ?? String(row.query)}
                disabled={locked}
                options={entriesOf(kind as DashboardWidgetKind).map((option) => ({ value: option, label: t(`console.dashboardWidgets.sources.${option}`) }))}
                onChange={(next) => onChange(setSource(value, index, next as Parameters<typeof setSource>[2]))}
              />,
            )
          : null}
      </div>
      {entry === null ? null : (
        <fieldset className="grid gap-3 md:grid-cols-3">
          <legend className="mb-1 text-xs text-muted-foreground">{t('console.dashboardWidgets.settings')}</legend>
          {WIDGET_PARAMS[entry].map((control) =>
            field(
              `param-${control.key}`,
              t(`console.dashboardWidgets.params.${control.key}`),
              <ParamControlInput control={control} id={`${id}-param-${control.key}`} value={params[control.key]} disabled={locked} onChange={(next) => onChange(setParam(value, index, control.key, next, control.type === 'choice' ? control.replaces : undefined))} />,
            ),
          )}
          {others.length > 0 ? (
            <p className="text-xs text-muted-foreground md:col-span-3">{t('console.dashboardWidgets.otherParams', { params: { keys: others.map((key) => `${key} = ${JSON.stringify(params[key])}`).join(', ') } })}</p>
          ) : null}
        </fieldset>
      )}
      <fieldset className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <legend className="mb-1 text-xs text-muted-foreground">{t('console.dashboardWidgets.position')}</legend>
        {AXES.map((axis) =>
          field(
            `position-${axis}`,
            t(`console.dashboardWidgets.axis.${axis}`),
            <Input
              id={`${id}-position-${axis}`}
              type="number"
              min={POSITION_RANGES[axis].min}
              max={POSITION_RANGES[axis].max}
              step={1}
              value={typeof position[axis] === 'number' ? String(position[axis]) : ''}
              disabled={locked}
              onChange={(event) => onChange(setPosition(value, index, axis, event.target.value === '' ? null : Number(event.target.value)))}
            />,
          ),
        )}
      </fieldset>
      {problems.length > 0 ? (
        <ul id={`${id}-problems`} className="flex flex-col gap-0.5 text-xs text-destructive" data-testid="dashboard-widget-problems">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
