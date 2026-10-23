import { EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { ACCESS_POLICY_VERSION_RESOURCE } from '../../data/resource-names';
import { ACCESS_EFFECT_ENUM } from '../../enums/access';
import {
  SCHEDULE_STATES,
  SUBJECT_KINDS,
  TARGET_KINDS,
  type TraceCandidate,
  formatRisk,
  humanizeValue,
  isKnown,
} from './decision-trace-format';
import { RecordLink } from './record-link';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface TracePoliciesProps {
  readonly candidates: readonly TraceCandidate[];
  readonly versionNames: Readonly<Record<string, string>>;
  readonly t: T;
}

/** "When" of a candidate: its validity first, then its schedule at that moment. */
function whenText(c: TraceCandidate, t: T): string {
  if (!c.valid) return t('notValid');
  if (c.schedule === null) return '—';
  return isKnown(c.schedule, SCHEDULE_STATES) ? t(`schedule_${c.schedule}`) : humanizeValue(c.schedule);
}

/** Who or where a candidate names: the block's words for a known kind, else the value humanized. */
function kindText(value: string | null, known: readonly string[], prefix: string, none: string, t: T): string {
  if (value === null) return t(none);
  return isKnown(value, known) ? t(`${prefix}_${value}`) : humanizeValue(value);
}

/**
 * The policy versions the engine evaluated, in its order (priority, deny first): whom and where
 * each names, whether it applied at that moment, and why it did or did not decide.
 */
export function TracePolicies({ candidates, versionNames, t }: TracePoliciesProps): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="trace-policies">
        <TableHeader>
          <TableRow>
            <TableHead>{t('colPolicy')}</TableHead>
            <TableHead>{t('colEffect')}</TableHead>
            <TableHead>{t('colPriority')}</TableHead>
            <TableHead>{t('colWho')}</TableHead>
            <TableHead>{t('colWhere')}</TableHead>
            <TableHead>{t('colWhen')}</TableHead>
            <TableHead>{t('colOutcome')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((c, index) => (
            <TableRow
              key={`${c.versionId ?? 'version'}:${index}`}
              data-testid="trace-policy"
              data-outcome={c.outcome}
              className={cn(c.outcome === 'decided' && 'bg-muted/50 font-medium')}
            >
              <TableCell>
                <RecordLink
                  resource={ACCESS_POLICY_VERSION_RESOURCE}
                  id={c.versionId}
                  name={c.versionId === null ? undefined : versionNames[c.versionId]}
                  fallback={t('unnamedVersion')}
                />
                {c.simulated ? <span className="ml-1 text-xs text-muted-foreground">({t('simulated')})</span> : null}
              </TableCell>
              <TableCell>
                {c.effect === null ? '—' : <EnumBadge enumName={ACCESS_EFFECT_ENUM} value={c.effect} />}
                {c.maxRisk === null ? null : (
                  <span className="block text-xs text-muted-foreground">{t('maxRisk', { params: { value: formatRisk(c.maxRisk) } })}</span>
                )}
              </TableCell>
              <TableCell className="tabular-nums">{c.priority ?? '—'}</TableCell>
              <TableCell className={cn(c.subject === null && 'text-muted-foreground')}>
                {kindText(c.subject, SUBJECT_KINDS, 'subject', 'noSubject', t)}
              </TableCell>
              <TableCell className={cn(c.target === null && 'text-muted-foreground')}>
                {kindText(c.target, TARGET_KINDS, 'target', 'noTarget', t)}
              </TableCell>
              <TableCell>{whenText(c, t)}</TableCell>
              <TableCell>{t(`outcome_${c.outcome}`)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
