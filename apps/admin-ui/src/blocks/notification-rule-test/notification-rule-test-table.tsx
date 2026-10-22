import { resourceShowHref } from '@burojs/core';
import { useApp } from '@burojs/react';
import {
  EnumBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  useLinkComponent,
} from '@burojs/ui-shadcn';
import type * as React from 'react';
import { EVENT_RESOURCE } from '../../data/resource-names';
import { EVENT_SEVERITY_ENUM, EVENT_TYPE_ENUM } from '../../enums/events';
import { NOTIFICATION_CHANNEL_ENUM } from '../../enums/notifications';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { type TestRow, recipientName } from './notification-rule-test-query';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface NotificationRuleTestTableProps {
  readonly rows: readonly TestRow[];
  readonly names: Readonly<Record<string, string>>;
  readonly t: T;
}

function Recipients({ row, names, t }: { readonly row: TestRow; readonly names: Readonly<Record<string, string>>; readonly t: T }) {
  if (!row.would_match) return null;
  if (row.recipients.length === 0) return <span className="text-muted-foreground">{t('nobody')}</span>;
  return (
    <ul className="flex flex-col gap-0.5" data-testid="test-recipients">
      {row.recipients.map((recipient) => (
        <li key={`${recipient.channel}:${recipient.user_id ?? recipient.address ?? ''}`} className="flex items-center gap-1">
          <span>{recipientName(recipient, names, t)}</span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <EnumBadge enumName={NOTIFICATION_CHANNEL_ENUM} value={recipient.channel} presentation="plain" />
        </li>
      ))}
    </ul>
  );
}

/** The tested events, newest first: time, event (linked), severity, outcome and the recipients of a match. */
export function NotificationRuleTestTable({ rows, names, t }: NotificationRuleTestTableProps): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const def = app.registry.get(EVENT_RESOURCE);
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="rule-test-results">
        <TableHeader>
          <TableRow>
            <TableHead>{t('when')}</TableHead>
            <TableHead>{t('event')}</TableHead>
            <TableHead>{t('severity')}</TableHead>
            <TableHead>{t('outcome')}</TableHead>
            <TableHead>{t('recipients')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.event_id} data-testid="rule-test-row" data-reason={row.reason} className={cn(!row.would_match && 'text-muted-foreground')}>
              <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(instantOf(row.occurred_at) ?? 0)}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <Link href={resourceShowHref(app.registry, def, EVENT_RESOURCE, row.event_id)} className="hover:underline">
                    {row.title}
                  </Link>
                  <EnumBadge enumName={EVENT_TYPE_ENUM} value={row.event_type} presentation="plain" />
                </div>
              </TableCell>
              <TableCell>
                <EnumBadge enumName={EVENT_SEVERITY_ENUM} value={row.severity} />
              </TableCell>
              <TableCell className={cn(row.would_match && 'font-medium')}>{t(`reason_${row.reason}`)}</TableCell>
              <TableCell>
                <Recipients row={row} names={names} t={t} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
