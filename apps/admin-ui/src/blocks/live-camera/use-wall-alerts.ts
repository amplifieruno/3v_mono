import { useList } from '@burojs/react';
import * as React from 'react';
import { z } from 'zod';
import { EVENT_RESOURCE } from '../../data/resource-names';

/** What a guard watching the wall must see: people of note, places they should not be, doors and cameras in trouble. */
export const WALL_ALERT_TYPES = [
  'blacklist_match',
  'watchlist_match',
  'vip_arrival',
  'restricted_area_entry',
  'tailgating',
  'inactive_profile_detected',
  'after_hours',
  'loitering',
  'unusual_dwell',
  'occupancy_exceeded',
  'device_offline',
  'device_error',
] as const;

/** Severities that light up the camera tile that saw the event. */
const TILE_SEVERITIES = new Set(['high', 'critical']);

/** How long a tile stays lit after its event, in milliseconds. */
export const TILE_ALERT_MS = 20_000;

/** How far back the feed reaches, and how often it is read again. */
const WINDOW_MS = 60 * 60_000;
const ALERTS_POLL_MS = 5_000;
const ALERTS_SHOWN = 30;

const alertRow = z.object({
  id: z.string(),
  occurred_at: z.string(),
  severity: z.string(),
  event_type: z.string(),
  title: z.string().nullable().optional(),
  device_id: z.string().nullable().optional(),
  'device_id.name': z.string().nullable().optional(),
  'identity_id.primary_photo_file_id': z.string().nullable().optional(),
});

/** One alert of the wall's feed. */
export interface WallAlert {
  readonly id: string;
  readonly at: number;
  readonly severity: string;
  readonly type: string;
  readonly title: string;
  readonly deviceId: string | null;
  readonly deviceName: string | null;
  readonly faceFileId: string | null;
}

export interface WallAlerts {
  readonly alerts: readonly WallAlert[];
  /** Alerts in the last hour (more than the feed shows when it is busy). */
  readonly total: number;
  readonly failed: boolean;
  readonly loading: boolean;
}

/** The newest alert that should light each camera's tile now, by device id. */
export function tileAlerts(alerts: readonly WallAlert[], now: number): ReadonlyMap<string, WallAlert> {
  const lit = new Map<string, WallAlert>();
  for (const alert of alerts) {
    if (alert.deviceId === null || !TILE_SEVERITIES.has(alert.severity)) continue;
    if (now - alert.at > TILE_ALERT_MS || lit.has(alert.deviceId)) continue;
    lit.set(alert.deviceId, alert);
  }
  return lit;
}

/**
 * The wall's alert feed: the last hour's events of the {@link WALL_ALERT_TYPES}, newest first, in
 * the facility chosen in the sidebar, with the camera that saw each and the person's face (their
 * identity's primary photo).
 * Read every five seconds.
 */
export function useWallAlerts(enabled: boolean): WallAlerts {
  // The window's start moves once a minute, so the query key stays put between polls.
  const since = new Date(Math.floor(Date.now() / 60_000) * 60_000 - WINDOW_MS).toISOString();
  const read = useList(EVENT_RESOURCE, {
    filter: {
      and: [
        { field: 'event_type', op: 'in', value: [...WALL_ALERT_TYPES] },
        { field: 'occurred_at', op: 'gte', value: since },
      ],
    },
    sort: [{ field: 'occurred_at', direction: 'desc' }],
    pagination: { kind: 'offset', page: 1, pageSize: ALERTS_SHOWN },
    relationColumns: ['device_id.name', 'identity_id.primary_photo_file_id'],
    refetchInterval: ALERTS_POLL_MS,
    enabled,
  });
  const list = read.data as { readonly data?: readonly unknown[]; readonly total?: unknown } | undefined;
  const alerts = React.useMemo(
    () =>
      (list?.data ?? []).flatMap((row): WallAlert[] => {
        const parsed = alertRow.safeParse(row);
        if (!parsed.success) return [];
        const r = parsed.data;
        return [
          {
            id: r.id,
            at: Date.parse(r.occurred_at),
            severity: r.severity,
            type: r.event_type,
            title: r.title ?? '',
            deviceId: r.device_id ?? null,
            deviceName: r['device_id.name'] ?? null,
            faceFileId: r['identity_id.primary_photo_file_id'] ?? null,
          },
        ];
      }),
    [list?.data],
  );
  return {
    alerts,
    total: typeof list?.total === 'number' ? list.total : alerts.length,
    failed: read.isError && read.data === undefined,
    loading: read.data === undefined && !read.isError,
  };
}
