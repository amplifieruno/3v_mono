import { EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { FACILITY_RESOURCE, RETENTION_POLICY_RESOURCE } from '../../data/resource-names';
import { RETENTION_ACTION_ENUM, RETENTION_DATA_CLASS_ENUM } from '../../enums/compliance';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { RecordLink } from '../access/record-link';
import type { PlanRow, RetentionPlan } from './retention-plan-query';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface RetentionPlanTableProps {
  readonly plan: RetentionPlan;
  readonly t: T;
}

/** The facility of a facility-specific target (linked), or the whole organization. */
function Scope({ row, plan, t }: { readonly row: PlanRow; readonly plan: RetentionPlan; readonly t: T }): React.ReactElement {
  if (row.facility_id === null) return <span>{t('organization')}</span>;
  return <RecordLink resource={FACILITY_RESOURCE} id={row.facility_id} name={plan.facilities[row.facility_id]} fallback={t('unknownFacility')} />;
}

/** The plan's targets in purge order: class, scope, action, days, cutoff, counts and the policy. */
export function RetentionPlanTable({ plan, t }: RetentionPlanTableProps): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="retention-plan-rows">
        <TableHeader>
          <TableRow>
            <TableHead>{t('dataClass')}</TableHead>
            <TableHead>{t('scope')}</TableHead>
            <TableHead>{t('action')}</TableHead>
            <TableHead>{t('days')}</TableHead>
            <TableHead>{t('cutoff')}</TableHead>
            <TableHead className="text-right">{t('candidates')}</TableHead>
            <TableHead className="text-right">{t('held')}</TableHead>
            <TableHead>{t('policy')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.rows.map((row) => {
            const cutoff = instantOf(row.cutoff);
            return (
              <TableRow key={`${row.data_class}:${row.facility_id ?? 'org'}`} data-testid="retention-plan-row" data-class={row.data_class}>
                <TableCell>
                  <EnumBadge enumName={RETENTION_DATA_CLASS_ENUM} value={row.data_class} presentation="plain" />
                </TableCell>
                <TableCell>
                  <Scope row={row} plan={plan} t={t} />
                </TableCell>
                <TableCell>
                  <EnumBadge enumName={RETENTION_ACTION_ENUM} value={row.action} />
                </TableCell>
                <TableCell>{t('daysValue', { params: { days: row.retain_days } })}</TableCell>
                <TableCell>{cutoff === null ? '—' : formatDateTime(cutoff)}</TableCell>
                <TableCell className="text-right tabular-nums" data-testid="retention-plan-candidates">
                  {row.candidates}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.held}</TableCell>
                <TableCell>
                  {row.policy_id === null ? (
                    <span className="text-muted-foreground">{t('consent')}</span>
                  ) : (
                    <RecordLink resource={RETENTION_POLICY_RESOURCE} id={row.policy_id} name={t('open')} fallback="" />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
