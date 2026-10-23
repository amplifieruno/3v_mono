import { EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { ACCESS_POLICY_RESOURCE, ACCESS_POLICY_VERSION_RESOURCE } from '../../data/resource-names';
import { ACCESS_EFFECT_ENUM, ACCESS_POLICY_VERSION_STATUS_ENUM } from '../../enums/access';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import type { AnalyticsRow } from './policy-analytics-query';
import { RecordLink } from './record-link';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface AnalyticsVersionsProps {
  readonly row: AnalyticsRow;
  readonly t: T;
}

/**
 * How often each version decided in the period (versions in force, and earlier versions that
 * decided in it), most decisions first; then the versions in force that decided nothing.
 */
export function AnalyticsVersions({ row, t }: AnalyticsVersionsProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2" aria-label={t('versionsTitle')}>
        <h3 className="text-sm font-semibold">{t('versionsTitle')}</h3>
        {row.versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('versionsNone')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table data-testid="analytics-versions">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('policy')}</TableHead>
                  <TableHead>{t('version')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('effect')}</TableHead>
                  <TableHead className="text-right">{t('priority')}</TableHead>
                  <TableHead className="text-right">{t('hits')}</TableHead>
                  <TableHead className="text-right">{t('granted')}</TableHead>
                  <TableHead className="text-right">{t('denied')}</TableHead>
                  <TableHead>{t('lastHit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.versions.map((version) => {
                  const last = instantOf(version.last_hit_at);
                  return (
                    <TableRow key={version.version_id} data-testid="analytics-version" className={cn(version.hits === 0 && 'text-muted-foreground')}>
                      <TableCell>
                        <RecordLink
                          resource={ACCESS_POLICY_RESOURCE}
                          id={version.policy_id}
                          name={`${version.policy_code} ${version.policy_name}`}
                          fallback=""
                        />
                      </TableCell>
                      <TableCell>
                        <RecordLink
                          resource={ACCESS_POLICY_VERSION_RESOURCE}
                          id={version.version_id}
                          name={t('versionNumber', { params: { version: version.version } })}
                          fallback=""
                        />
                      </TableCell>
                      <TableCell>
                        <EnumBadge enumName={ACCESS_POLICY_VERSION_STATUS_ENUM} value={version.status} />
                      </TableCell>
                      <TableCell>
                        <EnumBadge enumName={ACCESS_EFFECT_ENUM} value={version.effect} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{version.priority}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{version.hits}</TableCell>
                      <TableCell className="text-right tabular-nums">{version.granted}</TableCell>
                      <TableCell className="text-right tabular-nums">{version.denied}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{last === null ? t('never') : formatDateTime(last)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2" aria-label={t('unusedTitle')} data-testid="analytics-unused">
        <h3 className="text-sm font-semibold">{t('unusedTitle')}</h3>
        {row.unused_versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('unusedNone')}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('unusedNote')}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {row.unused_versions.map((version) => (
                <li key={version.version_id} className="flex items-center gap-2">
                  <RecordLink
                    resource={ACCESS_POLICY_RESOURCE}
                    id={version.policy_id}
                    name={`${version.policy_code} ${version.policy_name}`}
                    fallback=""
                  />
                  <EnumBadge enumName={ACCESS_EFFECT_ENUM} value={version.effect} presentation="plain" />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
