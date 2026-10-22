import { f } from '@burojs/field-types';

/** Where a stats column is shown; every one is written by the aggregation only. */
const SHOWN = ['list', 'show'] as const;

/** A count or figure of a stats table: read only, shown in the list and on the record. */
export function statFigure(label: string, summary: string, shown: readonly ('list' | 'show')[] = SHOWN) {
  return f.number({ system: true, nullable: true, in: [...shown], texts: { label, doc: { summary } } });
}

/** When the aggregation last wrote the row (shown on the record only). */
export const computedAt = () =>
  f.dateTime({
    system: true,
    in: ['show'],
    texts: { label: 'Computed', doc: { summary: 'When the hourly aggregation last wrote these figures.' } },
  });
