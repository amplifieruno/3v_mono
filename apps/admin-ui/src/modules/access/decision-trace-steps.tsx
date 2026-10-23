import type * as React from 'react';
import { useEnumLabel } from '../../blocks/charts/use-enum-label';
import { ACCESS_GRANT_RESOURCE, EMERGENCY_OVERRIDE_RESOURCE } from '../../data/resource-names';
import { OVERRIDE_MODE_ENUM } from '../../enums/access';
import { DEVICE_HEALTH_ENUM } from '../../enums/devices';
import { ACCESS_LEVEL_ENUM, PROFILE_STATUS_ENUM, PROFILE_TYPE_ENUM } from '../../enums/people';
import { type Trace, type TraceGrant, formatRisk } from './decision-trace-format';
import { RecordLink } from './record-link';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

/** One step of the trace: a heading and what the engine found. */
export function Step({ title, testId, children }: { readonly title: string; readonly testId: string; readonly children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1" data-testid={testId}>
      <h4 className="text-sm font-medium">{title}</h4>
      <div className="text-sm">{children}</div>
    </section>
  );
}

/** The overrides active at the door: which one decided. */
export function TraceOverrides({ trace, t }: { readonly trace: Trace; readonly t: T }): React.ReactElement | null {
  const modeLabel = useEnumLabel(OVERRIDE_MODE_ENUM);
  if (trace.overrides.length === 0) return null;
  return (
    <Step title={t('stepOverrides')} testId="trace-overrides">
      <ul className="list-disc pl-5">
        {trace.overrides.map((o, index) => {
          const text = t(o.applied ? 'overrideApplied' : 'overrideSkipped', { params: { mode: o.mode === null ? '—' : modeLabel(o.mode) } });
          return (
            <li key={`${o.id ?? 'override'}:${index}`}>
              <RecordLink resource={EMERGENCY_OVERRIDE_RESOURCE} id={o.id} name={o.id === null ? undefined : text} fallback={text} />
            </li>
          );
        })}
      </ul>
    </Step>
  );
}

/** The person as the engine saw them: profile status, type and access level, or unknown. */
export function TracePerson({ trace, t }: { readonly trace: Trace; readonly t: T }): React.ReactElement {
  const status = useEnumLabel(PROFILE_STATUS_ENUM);
  const type = useEnumLabel(PROFILE_TYPE_ENUM);
  const level = useEnumLabel(ACCESS_LEVEL_ENUM);
  const label = (of: (value: string) => string, value: string | null) => (value === null ? '—' : of(value).toLowerCase());
  return (
    <Step title={t('stepPerson')} testId="trace-person">
      {trace.person.known
        ? t('personKnown', {
            params: { status: label(status, trace.person.status), type: label(type, trace.person.type), level: label(level, trace.person.level) },
          })
        : t('personUnknown')}
    </Step>
  );
}

function grantText(g: TraceGrant, t: T): string {
  if (!g.applied) return t('grantSkipped');
  if (g.consumed) return t('grantConsumed');
  return t(g.singleUse ? 'grantAppliedSingle' : 'grantApplied');
}

/** The grants the engine looked at (only when no policy decided). */
export function TraceGrants({ trace, t }: { readonly trace: Trace; readonly t: T }): React.ReactElement {
  return (
    <Step title={t('stepGrants')} testId="trace-grants">
      {trace.grants.length === 0 ? (
        <p className="text-muted-foreground">{t('noGrants')}</p>
      ) : (
        <ul className="list-disc pl-5">
          {trace.grants.map((g, index) => {
            const text = grantText(g, t);
            return (
              <li key={`${g.id ?? 'grant'}:${index}`} data-testid="trace-grant">
                <RecordLink resource={ACCESS_GRANT_RESOURCE} id={g.id} name={g.id === null ? undefined : text} fallback={text} />
              </li>
            );
          })}
        </ul>
      )}
    </Step>
  );
}

/** The risk score and what added to it, with the contextual signals behind each part. */
export function TraceRisk({ trace, areaNames, t }: { readonly trace: Trace; readonly areaNames: Readonly<Record<string, string>>; readonly t: T }) {
  const health = useEnumLabel(DEVICE_HEALTH_ENUM);
  const areas = trace.overCapacityAreaIds.map((id) => areaNames[id] ?? t('unnamedArea')).join(', ');
  const params = (key: string, value: number): Record<string, unknown> => ({
    value: formatRisk(value),
    count: trace.recentDenials,
    areas,
    health: trace.deviceHealth === null ? '—' : health(trace.deviceHealth).toLowerCase(),
    key,
  });
  return (
    <Step title={t('stepRisk', { params: { score: formatRisk(trace.riskScore) } })} testId="trace-risk">
      {trace.riskParts.length === 0 ? (
        <p className="text-muted-foreground">{t('riskNone')}</p>
      ) : (
        <ul className="list-disc pl-5">
          {trace.riskParts.map((part) => (
            <li key={part.key} data-testid="trace-risk-part">
              {t(`risk_${part.key}`, { params: params(part.key, part.value) })}
            </li>
          ))}
        </ul>
      )}
      {trace.ignoredDevice ? <p className="text-muted-foreground">{t('ignoredDevice')}</p> : null}
    </Step>
  );
}
