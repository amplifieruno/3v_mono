import { Card, CardContent, CardHeader, CardTitle, cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { type DashboardWidget, type WidgetProblem, widgetSettings } from '../../modules/analytics/dashboard-contract';
import { ANALYTIC_BLOCKS } from '../../modules/analytics/widget-blocks';
import type { BlockT } from './block-t';
import { TileBoundary } from './tile-boundary';
import { WidgetBody } from './widget-body';

const TEST_ID = 'dashboard-tile';

export interface DashboardTileProps {
  /** The widget when the contract accepts it, else `null` (its problems say why). */
  readonly widget: DashboardWidget | null;
  /** The title to show: the widget's, else its id, else its place in the list. */
  readonly title: string;
  readonly problems: readonly WidgetProblem[];
  /**
   * The query root fields the viewer may read: `undefined` while they are read (the tile waits, so a
   * widget it may not read never sends its query), `null` when they cannot be read (every widget runs).
   */
  readonly readable: readonly string[] | null | undefined;
  /** The sidebar facility, for a facility widget naming none. */
  readonly facilityId: string | null;
  readonly className: string;
  /** The grid block's `t`. */
  readonly t: BlockT;
  /** How a refusal reads (translated from its code, with the English text as the default). */
  readonly problemText: (problem: WidgetProblem) => string;
}

/** A tile's note in place of its widget: muted, or a warning for a refusal. */
function Note({ state, children }: { readonly state: string; readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div data-testid={`${TEST_ID}:${state}`} role={state === 'invalid' ? 'alert' : undefined} className="flex flex-col gap-1 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** What a tile draws: its widget's block, or why it cannot. */
function TileContent({ widget, problems, readable, facilityId, t, problemText }: Omit<DashboardTileProps, 'title' | 'className'>): React.ReactElement {
  const invalid = (reasons: readonly string[]) => (
    <Note state="invalid">
      <p className="font-medium text-destructive">{t('invalid')}</p>
      <ul className="list-disc pl-5">
        {reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </Note>
  );
  if (widget === null || problems.length > 0) return invalid(problems.map(problemText));
  if (readable === undefined) return <Note state="loading">{t('loading')}</Note>;
  if (readable !== null && !readable.includes(widget.query)) return <Note state="no-access">{t('noAccess', { params: { query: widget.query } })}</Note>;
  const settings = widgetSettings(widget);
  if (!settings.ok) return invalid([settings.reason]);
  const entry = ANALYTIC_BLOCKS[settings.entry];
  let props = settings.props;
  if (entry.facility === 'required' && typeof props.facilityId !== 'string') {
    if (facilityId === null) return <Note state="choose-facility">{t('chooseFacility')}</Note>;
    props = { ...props, facilityId };
  }
  if (settings.entry === 'deviceHealthChart' && typeof props.deviceId !== 'string') return <Note state="choose-device">{t('chooseDevice')}</Note>;
  return (
    <TileBoundary fallback={<Note state="failed">{t('failed')}</Note>} resetKey={JSON.stringify([widget.kind, widget.query, widget.params])}>
      <WidgetBody entry={settings.entry} props={props} loading={t('loading')} invalid={(reason) => invalid([reason])} />
    </TileBoundary>
  );
}

/**
 * One widget of the dashboard (`itap:dashboard-grid`): a card titled by the widget over its block,
 * or over the reason it shows nothing: the viewer may not read its query, the contract or its block
 * refuses it, or it needs a facility (a device) it does not name and the sidebar has none.
 */
export function DashboardTile({ title, className, ...content }: DashboardTileProps): React.ReactElement {
  return (
    <Card data-testid={TEST_ID} role="region" aria-label={title} className={cn('flex min-h-0 flex-col gap-2 overflow-hidden py-3', className)}>
      <CardHeader className="px-4">
        <CardTitle className="truncate text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-4">
        <TileContent {...content} />
      </CardContent>
    </Card>
  );
}
