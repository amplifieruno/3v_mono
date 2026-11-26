import { resourceShowHref } from '@burojs/core';
import { useApp } from '@burojs/react';
import { Badge, cn, useLinkComponent } from '@burojs/ui-shadcn';
import { BellRing, UserRound } from 'lucide-react';
import type * as React from 'react';
import { useEnumLabel } from '../charts/use-enum-label';
import { EVENT_RESOURCE } from '../../data/resource-names';
import { EVENT_TYPE_ENUM } from '../../enums/events';
import { usePresignedUrl } from '../../fields/presigned-url';
import type { LiveCameraT } from './live-camera-texts';
import type { WallAlert, WallAlerts } from './use-wall-alerts';

/** The colour bar of an alert's severity. */
const SEVERITY_BAR: Readonly<Record<string, string>> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-sky-400',
  info: 'bg-slate-300',
};

/** Alerts this recent are marked as new. */
const FRESH_MS = 20_000;

const timeOf = (at: number): string =>
  new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** The face the camera captured for the alert, or a person outline when there is none. */
function Face({ fileId }: { readonly fileId: string | null }): React.ReactElement {
  const presigned = usePresignedUrl(fileId);
  const url = presigned.data?.url;
  return url ? (
    <img src={url} alt="" className="size-10 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
      <UserRound className="size-5" aria-hidden />
    </span>
  );
}

function AlertRow({ alert, now, typeLabel }: { readonly alert: WallAlert; readonly now: number; readonly typeLabel: string }) {
  const app = useApp();
  const Link = useLinkComponent();
  const href = resourceShowHref(app.registry, app.registry.get(EVENT_RESOURCE), EVENT_RESOURCE, alert.id);
  return (
    <li data-testid="wall-alert" className={cn('relative', now - alert.at < FRESH_MS && 'bg-destructive/5')}>
      <span className={cn('absolute inset-y-2 left-0 w-1 rounded-r', SEVERITY_BAR[alert.severity] ?? 'bg-slate-300')} />
      <Link href={href} className="flex gap-3 py-2.5 pr-3 pl-4 hover:bg-muted/60">
        <Face fileId={alert.faceFileId} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{typeLabel}</span>
          <span className="truncate text-xs text-muted-foreground">{alert.title}</span>
          <span className="truncate text-xs text-muted-foreground tabular-nums">
            {timeOf(alert.at)}
            {alert.deviceName ? ` · ${alert.deviceName}` : ''}
          </span>
        </span>
      </Link>
    </li>
  );
}

export interface WallAlertsPanelProps {
  readonly feed: WallAlerts;
  readonly now: number;
  readonly t: LiveCameraT;
}

/** The wall's alert feed beside the cameras: the last hour's alerts, newest first, each linked to its event. */
export function WallAlertsPanel({ feed, now, t }: WallAlertsPanelProps): React.ReactElement {
  const typeLabel = useEnumLabel(EVENT_TYPE_ENUM);
  return (
    <aside
      aria-label={t('alerts')}
      data-testid="wall-alerts"
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="size-4 text-destructive" aria-hidden />
          {t('alerts')}
        </span>
        <Badge variant={feed.total > 0 ? 'destructive' : 'secondary'} className="tabular-nums">
          {feed.total}
        </Badge>
      </header>
      {feed.failed ? (
        <p className="p-4 text-sm text-destructive">{t('alertsFailed')}</p>
      ) : feed.loading ? (
        <p className="p-4 text-sm text-muted-foreground">{t('alertsLoading')}</p>
      ) : feed.alerts.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">{t('alertsNone')}</p>
      ) : (
        <ol className="min-h-0 flex-1 divide-y overflow-y-auto">
          {feed.alerts.map((alert) => (
            <AlertRow key={alert.id} alert={alert} now={now} typeLabel={typeLabel(alert.type)} />
          ))}
        </ol>
      )}
    </aside>
  );
}
