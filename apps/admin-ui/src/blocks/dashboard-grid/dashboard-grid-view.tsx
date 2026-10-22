import { type BlockViewProps, useCustomQuery, useT } from '@burojs/react';
import type * as React from 'react';
import { type FieldProblem, problemKey } from '../../fields/field-issue';
import { type WidgetProblem, contractProblems, isContractWidget, nameOf } from '../../modules/analytics/dashboard-contract';
import { BlockNote } from '../charts/block-note';
import type { dashboardGridBlock } from './dashboard-grid-block';
import { DashboardTile } from './dashboard-tile';
import { GRID_CLASSES, tileClasses, tileOrder } from './dashboard-layout';
import { readableRootFields } from './readable-fields-query';

const TEST_ID = 'dashboard-grid';

/** Where a widget the contract refuses sits: full width, two rows, in its list order. */
const FALLBACK_POSITION = { x: 0, w: 12, h: 2 } as const;

/** The dashboard grid's view (`itap:dashboard-grid`): every widget as a tile, in reading order. */
export function DashboardGridView({ props, t }: BlockViewProps<typeof dashboardGridBlock>): React.ReactElement {
  const readable = useCustomQuery(readableRootFields, {});
  const common = useT();
  const widgets = props.widgets;
  const intro = props.preview ? <p className="text-xs text-muted-foreground">{t('preview')}</p> : null;
  if (widgets !== undefined && widgets !== null && !Array.isArray(widgets)) return <BlockNote testId={TEST_ID} tone="error">{t('notList')}</BlockNote>;
  const list: readonly unknown[] = Array.isArray(widgets) ? widgets : [];
  if (list.length === 0) return <BlockNote testId={TEST_ID}>{t(props.preview ? 'previewEmpty' : 'empty')}</BlockNote>;
  const problems = contractProblems(list);
  const problemText = (problem: FieldProblem) => common(problemKey(problem.code), { params: problem.params ?? {} });
  const tiles = tileOrder(
    list.map((widget, index) => ({
      index,
      widget: isContractWidget(widget) ? widget : null,
      position: isContractWidget(widget) ? widget.position : { ...FALLBACK_POSITION, y: index },
      problems: problems.filter((p): p is WidgetProblem => p.index === index),
    })),
  );
  return (
    <section data-testid={TEST_ID} aria-label={t('label')} className="flex flex-col gap-3">
      {intro}
      <div className={GRID_CLASSES}>
        {tiles.map((tile) => (
          <DashboardTile
            key={`${tile.index}:${tile.widget?.id ?? ''}`}
            widget={tile.widget}
            title={nameOf(list[tile.index]) || t('untitled', { params: { position: tile.index + 1 } })}
            problems={tile.problems}
            readable={readable.isError ? null : readable.data}
            facilityId={props.facilityId ?? null}
            className={tileClasses(tile.position)}
            t={t}
            problemText={problemText}
          />
        ))}
      </div>
    </section>
  );
}
