import type * as React from 'react';
import { useEnumLabel } from '../../blocks/charts/use-enum-label';
import { ACCESS_EFFECT_ENUM } from '../../enums/access';
import type { AnalyticsRow, OverlapHint } from './policy-analytics-query';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface AnalyticsRuleSetProps {
  readonly row: AnalyticsRow;
  readonly t: T;
}

const GRANT_BUCKETS = ['used', 'revoked', 'expired', 'unused'] as const;

/** A version of an overlap by its policy code and version number (the versions in force are all in the row). */
function versionName(row: AnalyticsRow, versionId: string): string {
  const version = row.versions.find((v) => v.version_id === versionId);
  return version === undefined ? versionId : `${version.policy_code} ${version.policy_name} (v${version.version})`;
}

function Figure({ label, value }: { readonly label: string; readonly value: number }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Overlapping versions in force, how the period's grants ended, and the size of the rule set. */
export function AnalyticsRuleSet({ row, t }: AnalyticsRuleSetProps): React.ReactElement {
  const effectLabel = useEnumLabel(ACCESS_EFFECT_ENUM);
  const overlapText = (hint: OverlapHint) =>
    t(`overlap_${hint.kind}`, {
      params: {
        a: versionName(row, hint.version_a),
        b: versionName(row, hint.version_b),
        effectA: effectLabel(hint.effect_a),
        effectB: effectLabel(hint.effect_b),
      },
    });
  const size = row.complexity;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="flex flex-col gap-2" aria-label={t('overlapsTitle')} data-testid="analytics-overlaps">
        <h3 className="text-sm font-semibold">{t('overlapsTitle')}</h3>
        {row.overlap_hints.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('overlapsNone')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {row.overlap_hints.map((hint) => (
              <li key={`${hint.version_a}:${hint.version_b}`} className={hint.kind === 'conflicting' ? 'text-destructive' : undefined}>
                {overlapText(hint)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2" aria-label={t('grantsTitle')} data-testid="analytics-grants">
        <h3 className="text-sm font-semibold">{t('grantsTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('grantsNote')}</p>
        <dl className="flex flex-col gap-1 text-sm">
          {GRANT_BUCKETS.map((bucket) => (
            <Figure key={bucket} label={t(`grants_${bucket}`)} value={row.grants[bucket]} />
          ))}
        </dl>
      </section>
      <section className="flex flex-col gap-2" aria-label={t('complexityTitle')} data-testid="analytics-complexity">
        <h3 className="text-sm font-semibold">{t('complexityTitle')}</h3>
        <dl className="flex flex-col gap-1 text-sm">
          <Figure label={t('complexity_enforced')} value={size.enforced_policies} />
          <Figure label={t('complexity_subjects', { params: { avg: size.avg_subjects } })} value={size.subjects} />
          <Figure label={t('complexity_targets', { params: { avg: size.avg_targets } })} value={size.targets} />
          <Figure label={t('complexity_schedules')} value={size.schedules} />
          <Figure label={t('complexity_maxRisk')} value={size.max_risk} />
        </dl>
      </section>
    </div>
  );
}
