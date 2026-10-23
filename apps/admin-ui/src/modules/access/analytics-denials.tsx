import { useCustomQuery } from '@burojs/react';
import { EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { ACCESS_POINT_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { ACCESS_DECISION_REASON_ENUM } from '../../enums/access';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { accessNamesQuery, idsOf } from './access-names-query';
import type { AnalyticsRow } from './policy-analytics-query';
import { RecordLink } from './record-link';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface AnalyticsDenialsProps {
  readonly row: AnalyticsRow;
  readonly t: T;
}

/** Why doors denied (each reason with its count) and the ten most denied person-door pairs, by name. */
export function AnalyticsDenials({ row, t }: AnalyticsDenialsProps): React.ReactElement {
  const top = row.top_denied;
  const names = useCustomQuery(
    accessNamesQuery,
    { profileIds: idsOf(top, (r) => r.profile_id), accessPointIds: idsOf(top, (r) => r.access_point_id), identityIds: [] },
    { enabled: top.length > 0 },
  );
  const profiles = names.data?.profiles ?? {};
  const points = names.data?.accessPoints ?? {};
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label={t('reasonsTitle')} data-testid="analytics-reasons">
        <h3 className="text-sm font-semibold">{t('reasonsTitle')}</h3>
        {row.denial_reasons.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('reasonsNone')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {row.denial_reasons.map((reason) => (
              <li key={reason.reason} className="flex items-center justify-between gap-4" data-reason={reason.reason}>
                <EnumBadge enumName={ACCESS_DECISION_REASON_ENUM} value={reason.reason} />
                <span className="tabular-nums">{reason.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {top.length === 0 ? null : (
        <section className="flex flex-col gap-2" aria-label={t('topTitle')}>
          <h3 className="text-sm font-semibold">{t('topTitle')}</h3>
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="analytics-top-denied">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('person')}</TableHead>
                  <TableHead>{t('door')}</TableHead>
                  <TableHead className="text-right">{t('denied')}</TableHead>
                  <TableHead>{t('lastDenied')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((pair) => (
                  <TableRow key={`${pair.profile_id ?? 'unknown'}:${pair.access_point_id}`}>
                    <TableCell>
                      {pair.profile_id === null ? (
                        <span className="text-muted-foreground">{t('unknownPerson')}</span>
                      ) : (
                        <RecordLink resource={PROFILE_RESOURCE} id={pair.profile_id} name={profiles[pair.profile_id]} fallback={t('notVisible')} />
                      )}
                    </TableCell>
                    <TableCell>
                      <RecordLink
                        resource={ACCESS_POINT_RESOURCE}
                        id={pair.access_point_id}
                        name={points[pair.access_point_id]}
                        fallback={t('notVisible')}
                      />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{pair.denied}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(instantOf(pair.last_denied_at) ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
