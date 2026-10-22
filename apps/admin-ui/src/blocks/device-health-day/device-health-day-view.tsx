import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp, useCustomQuery } from '@burojs/react';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, useLinkComponent } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { DEVICE_RESOURCE } from '../../data/resource-names';
import { BlockNote } from '../charts/block-note';
import { formatFigure } from '../charts/chart-scale';
import type { deviceHealthDayBlock } from './device-health-day-block';
import { deviceHealthDay, devicesByTrouble } from './device-health-day-query';

const TEST_ID = 'device-health-day';

/** The 24-hour device health table's view (`itap:device-health-day`): one row per device, troubled first. */
export function DeviceHealthDayView({ props, t }: BlockViewProps<typeof deviceHealthDayBlock>): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const devices = useCustomQuery(deviceHealthDay, { facilityId: props.facilityId ?? null });
  if (devices.isError || devices.data === null) return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  if (devices.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;
  if (devices.data.length === 0) return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  const def = app.registry.get(DEVICE_RESOURCE);
  const unit = (key: string, value: number | null) => (value === null ? t('noValue') : t(key, { params: { value: formatFigure(value) } }));
  return (
    <Table data-testid={TEST_ID}>
      <TableCaption>{t('caption')}</TableCaption>
      <TableHeader>
        <TableRow>
          {['device', 'checks', 'failedChecks', 'cpu', 'memory', 'latency', 'frameRate'].map((key) => (
            <TableHead key={key} scope="col">
              {t(key)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {devicesByTrouble(devices.data).map((device) => {
          const { count, sum, avg } = device.device_health_metrics_aggregate.aggregate;
          return (
            <TableRow key={device.id} data-testid={`${TEST_ID}-row`}>
              <TableHead scope="row" className="font-medium">
                <Link href={resourceShowHref(app.registry, def, DEVICE_RESOURCE, device.id)} className="hover:underline">
                  {device.name}
                </Link>
              </TableHead>
              <TableCell className="tabular-nums">{count}</TableCell>
              <TableCell className={(sum.error_count ?? 0) > 0 ? 'tabular-nums text-destructive' : 'tabular-nums'}>{sum.error_count ?? 0}</TableCell>
              <TableCell className="tabular-nums">{unit('percent', avg.cpu_usage)}</TableCell>
              <TableCell className="tabular-nums">{unit('percent', avg.memory_usage)}</TableCell>
              <TableCell className="tabular-nums">{unit('ms', avg.network_latency_ms)}</TableCell>
              <TableCell className="tabular-nums">{unit('fps', avg.frame_rate)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
