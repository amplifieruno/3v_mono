import { useT } from '@burojs/react';
import { Checkbox, Input, Label } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { useBlockT } from '../blocks/dashboard-grid/block-t';
import { useEnumLabel } from '../blocks/charts/use-enum-label';
import { KPI_FIGURES } from '../blocks/kpis/kpis-block';
import type { ParamControl } from './dashboard-widget-params-catalog';
import { RecordParam } from './dashboard-param-record';
import { ParamSelect, UNSET } from './dashboard-param-select';

export interface ParamControlInputProps {
  readonly control: ParamControl;
  readonly id: string;
  readonly value: unknown;
  /** `undefined` removes the key (the block's default applies). */
  readonly onChange: (next: unknown) => void;
  readonly disabled: boolean;
}

/** A stored value as text: a number as is, a list of names comma-separated, anything else as JSON (for the refusal to name). */
const asText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join(', ');
  return JSON.stringify(value);
};

/** The KPI figures a key-figures widget shows: ticked ones in the block's order; none ticked = every figure. */
function FiguresParam({ id, value, onChange, disabled }: Omit<ParamControlInputProps, 'control'>): React.ReactElement {
  const kpiT = useBlockT('itap:kpis');
  const chosen = Array.isArray(value) ? value : [];
  return (
    <div id={id} role="group" className="flex flex-wrap gap-x-4 gap-y-1">
      {KPI_FIGURES.map((figure) => (
        <span key={figure} className="flex items-center gap-1.5">
          <Checkbox
            id={`${id}-${figure}`}
            checked={chosen.includes(figure)}
            disabled={disabled}
            onCheckedChange={(checked) => {
              const next = KPI_FIGURES.filter((f) => (f === figure ? checked === true : chosen.includes(f)));
              onChange(next.length === 0 ? undefined : next);
            }}
          />
          <Label htmlFor={`${id}-${figure}`} className="text-xs font-normal">
            {kpiT(figure)}
          </Label>
        </span>
      ))}
    </div>
  );
}

/** One setting of a widget's source (`./dashboard-widget-params-catalog.ts`), with "default" to leave it out. */
export function ParamControlInput({ control, id, value, onChange, disabled }: ParamControlInputProps): React.ReactElement {
  const t = useT();
  const enumLabel = useEnumLabel(control.type === 'choice' && control.enumName !== undefined ? control.enumName : 'event_severity');
  const byDefault = t('console.dashboardWidgets.default');
  switch (control.type) {
    case 'record':
      return <RecordParam id={id} resource={control.resource} empty={control.empty} value={value} onChange={onChange} disabled={disabled} />;
    case 'figures':
      return <FiguresParam id={id} value={value} onChange={onChange} disabled={disabled} />;
    case 'number':
      return (
        <Input
          id={id}
          type="number"
          min={control.min}
          max={control.max}
          step={1}
          placeholder={t('console.dashboardWidgets.range', { params: { min: control.min, max: control.max } })}
          value={asText(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        />
      );
    case 'boolean':
      return (
        <ParamSelect
          id={id}
          value={value === true ? 'true' : value === false ? 'false' : value === undefined ? UNSET : asText(value)}
          options={[
            { value: UNSET, label: byDefault },
            { value: 'true', label: t('console.dashboardWidgets.yes') },
            { value: 'false', label: t('console.dashboardWidgets.no') },
          ]}
          onChange={(next) => onChange(next === UNSET ? undefined : next === 'true')}
          disabled={disabled}
        />
      );
    case 'choice':
      return (
        <ParamSelect
          id={id}
          value={value === undefined ? UNSET : typeof value === 'string' ? value : asText(value)}
          options={[
            { value: UNSET, label: byDefault },
            ...control.options.map((option) => ({
              value: option,
              label: control.enumName === undefined ? t(`console.dashboardWidgets.option.${control.key}.${option}`) : enumLabel(option),
            })),
          ]}
          // A stored non-text value (a list of statuses) is kept when it is chosen again.
          onChange={(next) => onChange(next === UNSET ? undefined : typeof value !== 'string' && next === asText(value) ? value : next)}
          disabled={disabled}
        />
      );
  }
}
