import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { EnumBadge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { ACCESS_DECISION_RESOURCE, ACCESS_POINT_RESOURCE, IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { ACCESS_DECISION_REASON_ENUM, ACCESS_DECISION_RESULT_ENUM } from '../../enums/access';
import type { decisionTraceBlock } from './decision-trace-block';
import { DECIDED_BY, type Trace, formatRisk, humanizeValue, isKnown, traceOf } from './decision-trace-format';
import { TracePolicies } from './decision-trace-policies';
import { type DecisionTrace, accessDecisionTrace, accessTraceNames } from './decision-trace-query';
import { Step, TraceGrants, TraceOverrides, TracePerson, TraceRisk } from './decision-trace-steps';
import { RecordLink } from './record-link';

type Props = BlockViewProps<typeof decisionTraceBlock>;
type T = Props['t'];

const EMPTY_NAMES = { versions: {}, areas: {} };

function personName(decision: DecisionTrace): string | undefined {
  const p = decision.profile;
  if (p === null) return undefined;
  const name = [p.first_name, p.last_name].filter((part) => part !== null && part !== '').join(' ');
  return name !== '' ? name : (p.code ?? undefined);
}

/** Result, reason, who, where and the risk, in one line. */
function Headline({ decision, link, t }: { readonly decision: DecisionTrace; readonly link: boolean; readonly t: T }) {
  const person =
    decision.profile_id !== null ? (
      <RecordLink resource={PROFILE_RESOURCE} id={decision.profile_id} name={personName(decision)} fallback={t('gonePerson')} />
    ) : (
      <RecordLink resource={IDENTITY_RESOURCE} id={decision.identity_id} name={decision.identity?.code} fallback={t('unknownPerson')} />
    );
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="trace-headline">
      <EnumBadge enumName={ACCESS_DECISION_RESULT_ENUM} value={decision.result} />
      <EnumBadge enumName={ACCESS_DECISION_REASON_ENUM} value={decision.reason} presentation="plain" />
      <span className="text-sm">
        {person} · <RecordLink resource={ACCESS_POINT_RESOURCE} id={decision.access_point_id} name={decision.access_point?.name} fallback={t('goneDoor')} />
      </span>
      <span className="text-sm text-muted-foreground">{t('risk', { params: { score: formatRisk(decision.risk_score) } })}</span>
      {link ? (
        <span className="text-sm">
          <RecordLink resource={ACCESS_DECISION_RESOURCE} id={decision.id} name={t('openDecision')} fallback={t('openDecision')} />
        </span>
      ) : null}
    </div>
  );
}

/** The steps of the trace, in the engine's order. */
function Steps({ trace, names, t }: { readonly trace: Trace; readonly names: typeof EMPTY_NAMES; readonly t: T }) {
  return (
    <div className="flex flex-col gap-4">
      {trace.decidedBy === null ? null : (
        <p className="text-sm" data-testid="trace-decided-by">
          {isKnown(trace.decidedBy, DECIDED_BY)
            ? t(`decidedBy_${trace.decidedBy}`)
            : t('decidedBy_other', { params: { step: humanizeValue(trace.decidedBy) } })}
        </p>
      )}
      <TraceOverrides trace={trace} t={t} />
      <TracePerson trace={trace} t={t} />
      <Step title={t('stepPolicies', { params: { count: trace.candidates.length } })} testId="trace-policies-step">
        {trace.candidates.length === 0 ? (
          <p className="text-muted-foreground">{t('noPolicies')}</p>
        ) : (
          <TracePolicies candidates={trace.candidates} versionNames={names.versions} t={t} />
        )}
      </Step>
      <TraceGrants trace={trace} t={t} />
      <TraceRisk trace={trace} areaNames={names.areas} t={t} />
      {trace.epoch === null ? null : (
        <p className="text-xs text-muted-foreground">{t('epoch', { params: { epoch: trace.epoch, timezone: trace.timezone ?? 'UTC' } })}</p>
      )}
    </div>
  );
}

/**
 * How a door decided (`itap:access-decision-trace`): the decision read fresh, its headline, then
 * the trace as steps with names (policy versions, crowded areas) read in a second query.
 */
export function DecisionTraceView({ props, t }: Props): React.ReactElement {
  const decisionId = props.decisionId ?? null;
  const decision = useCustomQuery(accessDecisionTrace, { decisionId: decisionId ?? '' }, { enabled: decisionId !== null });
  const trace = decision.data ? traceOf(decision.data.signals) : null;
  const versionIds = (trace?.candidates ?? []).flatMap((c) => (c.versionId === null ? [] : [c.versionId]));
  const areaIds = trace?.overCapacityAreaIds ?? [];
  const names = useCustomQuery(
    accessTraceNames,
    { versionIds: [...new Set(versionIds)], areaIds: [...new Set(areaIds)] },
    { enabled: versionIds.length + areaIds.length > 0 },
  );

  let body: React.ReactNode;
  if (decisionId === null) body = <p className="text-sm text-muted-foreground">{t('testIntro')}</p>;
  else if (decision.isError) body = <p className="text-sm text-destructive">{t('failed')}</p>;
  else if (decision.data === undefined) body = <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  else if (decision.data === null) body = <p className="text-sm text-destructive">{t('gone')}</p>;
  else {
    body = (
      <>
        <Headline decision={decision.data} link={props.showDecisionLink ?? false} t={t} />
        {trace === null ? <p className="text-sm text-muted-foreground">{t('noTrace')}</p> : <Steps trace={trace} names={names.data ?? EMPTY_NAMES} t={t} />}
      </>
    );
  }
  return (
    <section className="flex flex-col gap-4" data-testid="decision-trace" aria-label={t('label')}>
      {body}
    </section>
  );
}
