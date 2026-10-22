import { useList, useT } from '@burojs/react';
import type * as React from 'react';
import { ParamSelect, UNSET } from './dashboard-param-select';

/** The most records a settings picker lists (facilities, segments, devices of one organization). */
export const PARAM_RECORD_LIMIT = 500;

export interface RecordParamProps {
  readonly id: string;
  readonly resource: string;
  /** What no record means for this widget: the sidebar facility, every facility, the largest segments, or none yet. */
  readonly empty: 'sidebar' | 'every' | 'largest' | 'none';
  readonly value: unknown;
  /** `undefined` removes the key; `null` keeps it empty (a device chart names its device key). */
  readonly onChange: (next: unknown) => void;
  readonly disabled: boolean;
}

const nameOf = (row: unknown): { id: string; name: string } | null => {
  const value = row !== null && typeof row === 'object' ? (row as Readonly<Record<string, unknown>>) : {};
  return typeof value.id === 'string' ? { id: value.id, name: typeof value.name === 'string' ? value.name : value.id } : null;
};

/** A facility, segment or device a widget names, picked by name from the organization's records. */
export function RecordParam({ id, resource, empty, value, onChange, disabled }: RecordParamProps): React.ReactElement {
  const t = useT();
  const read = useList(resource, {
    sort: [{ field: 'name', direction: 'asc' }],
    pagination: { kind: 'offset', page: 1, pageSize: PARAM_RECORD_LIMIT },
    scope: 'none',
  });
  const rows = ((read.data as { readonly data?: readonly unknown[] } | undefined)?.data ?? []).flatMap((row) => {
    const named = nameOf(row);
    return named === null ? [] : [{ value: named.id, label: named.name }];
  });
  const current = typeof value === 'string' && value !== '' ? value : UNSET;
  return (
    <ParamSelect
      id={id}
      value={current}
      disabled={disabled}
      options={[{ value: UNSET, label: t(`console.dashboardWidgets.empty.${empty}`) }, ...rows]}
      onChange={(next) => onChange(next === UNSET ? (empty === 'none' ? null : undefined) : next)}
    />
  );
}
