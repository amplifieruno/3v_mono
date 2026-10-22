import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp, useCustomQuery } from '@burojs/react';
import { EnumBadge, useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { DEVICE_HEALTH_ENUM, DEVICE_STATUS_ENUM } from '../../enums/devices';
import { BlockNote } from '../charts/block-note';
import { StackedBar } from '../charts/stacked-bar';
import type { deviceHealthSummaryBlock } from './device-health-summary-block';
import { deviceHealthSummary } from './device-health-summary-query';
import { devicesNeedingAttention, healthParts } from './device-health-summary-shape';

const TEST_ID = 'device-health-summary';

/** The device health summary's view (`itap:device-health-summary`): the health bar and the devices needing attention. */
export function DeviceHealthSummaryView({ props, t }: BlockViewProps<typeof deviceHealthSummaryBlock>): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const devices = useCustomQuery(deviceHealthSummary, { facilityId: props.facilityId ?? null });
  if (devices.isError || devices.data === null) return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  if (devices.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;
  if (devices.data.length === 0) return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  const parts = healthParts(devices.data).map((part) => ({
    ...part,
    legend: <EnumBadge enumName={DEVICE_HEALTH_ENUM} value={part.key} presentation="plain" />,
  }));
  const attention = devicesNeedingAttention(devices.data);
  const shown = attention.slice(0, props.limit);
  const def = app.registry.get(DEVICE_RESOURCE);
  return (
    <section data-testid={TEST_ID} className="flex flex-col gap-3" aria-label={t('label')}>
      <p className="text-sm">{t('inService', { params: { count: devices.data.length } })}</p>
      <StackedBar testId={`${TEST_ID}:health`} parts={parts} ariaLabel={t('healthChart')} legend />
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t('attention')}</h3>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('allWell')}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border text-sm">
            {shown.map((device) => (
              <li key={device.id} data-testid={`${TEST_ID}-row`} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                <Link href={resourceShowHref(app.registry, def, DEVICE_RESOURCE, device.id)} className="min-w-0 truncate font-medium hover:underline">
                  {device.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {[
                    device.facility?.name ?? t('everywhere'),
                    device.last_seen_at === null
                      ? t('neverSeen')
                      : t('lastSeen', { params: { time: new Date(device.last_seen_at).toLocaleString() } }),
                  ].join(' · ')}
                </span>
                <span className="ml-auto flex gap-1">
                  <EnumBadge enumName={DEVICE_HEALTH_ENUM} value={device.health_status} />
                  <EnumBadge enumName={DEVICE_STATUS_ENUM} value={device.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {attention.length > shown.length ? (
          <p className="text-xs text-muted-foreground">{t('more', { params: { count: attention.length - shown.length } })}</p>
        ) : null}
      </div>
    </section>
  );
}
