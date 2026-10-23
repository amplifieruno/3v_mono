import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp } from '@burojs/react';
import { EnumBadge, cn, useLinkComponent } from '@burojs/ui-shadcn';
import { CircleCheck, CircleX } from 'lucide-react';
import type * as React from 'react';
import { useEnumLabel } from '../../blocks/charts/use-enum-label';
import { AUTHENTICATION_ATTEMPT_RESOURCE, AUTHENTICATION_SESSION_RESOURCE, IDENTITY_RESOURCE } from '../../data/resource-names';
import { AUTH_ATTRIBUTE_ENUM } from '../../enums/face-auth';
import { AUTH_ATTACK_OUTCOME_ENUM, AUTH_OUTCOME_ENUM } from '../../enums/face-auth-records';
import type { authDecisionBlock } from './decision-block';

type Props = BlockViewProps<typeof authDecisionBlock>;

const NEXT_STEPS: ReadonlySet<string> = new Set(['none', 'capture', 'recapture', 'second_factor', 'review']);

/** An attribute's value as text: a photo link stays a link, a list is joined, anything else as JSON. */
function AttributeValue({ value, photoLabel }: { readonly value: unknown; readonly photoLabel: string }): React.ReactElement {
  const url = (value as { readonly url?: unknown } | null)?.url;
  if (typeof url === 'string') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
        {photoLabel}
      </a>
    );
  }
  if (Array.isArray(value)) return <span>{value.map(String).join(', ')}</span>;
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return <span>{typeof value === 'string' ? value : JSON.stringify(value)}</span>;
}

/** One label and value line of the decision. */
function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div className="grid gap-1 sm:grid-cols-[14rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * The answer of "Authenticate a face" (`itap:auth-decision`): authenticated or not, then each
 * field of the API's answer, then links to the recorded session and attempt.
 */
export function AuthDecisionView({ props, t }: Props): React.ReactElement {
  const app = useApp();
  const Link = useLinkComponent();
  const attributeLabel = useEnumLabel(AUTH_ATTRIBUTE_ENUM);
  const href = (resource: string, id: string): string => resourceShowHref(app.registry, app.registry.get(resource), resource, id);
  const attributes = Object.entries(props.attributes ?? {});
  const Icon = props.authenticated ? CircleCheck : CircleX;
  return (
    <section className="flex flex-col gap-4" data-testid="auth-decision" data-outcome={props.outcome} aria-label={t('label')}>
      <p
        role="status"
        className={cn('flex items-center gap-2 text-base font-medium', props.authenticated ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive')}
      >
        <Icon className="size-5" aria-hidden />
        {props.authenticated ? t('authenticated') : t('notAuthenticated')}
      </p>
      <dl className="flex flex-col gap-3">
        <Row label={t('outcome')}>
          <EnumBadge enumName={AUTH_OUTCOME_ENUM} value={props.outcome} />
        </Row>
        <Row label={t('confidence')}>
          {props.confidence === null || props.confidence === undefined ? (
            <span className="text-muted-foreground">{t('noConfidence')}</span>
          ) : (
            <span className="tabular-nums" data-testid="auth-decision-confidence">
              {props.confidence.toFixed(3)}
            </span>
          )}
        </Row>
        {props.identityId ? (
          <Row label={t('identity')}>
            <Link href={href(IDENTITY_RESOURCE, props.identityId)} className="text-primary underline-offset-4 hover:underline">
              {t('openIdentity')}
            </Link>
          </Row>
        ) : null}
        <Row label={t('attributes')}>
          {attributes.length === 0 ? (
            <span className="text-muted-foreground">{t('noAttributes')}</span>
          ) : (
            <ul className="flex flex-col gap-1" data-testid="auth-decision-attributes">
              {attributes.map(([key, value]) => (
                <li key={key}>
                  <span className="text-muted-foreground">{attributeLabel(key)}: </span>
                  <AttributeValue value={value} photoLabel={t('photoLink')} />
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label={t('attack')}>
          <EnumBadge enumName={AUTH_ATTACK_OUTCOME_ENUM} value={props.attackOutcome} />
        </Row>
        {props.failureCode ? (
          <Row label={t('failure')}>
            <span className="flex flex-col gap-1" data-testid="auth-decision-failure">
              <span>{props.failureMessage}</span>
              <span className="text-xs text-muted-foreground">{t('failureCode', { params: { code: props.failureCode } })}</span>
            </span>
          </Row>
        ) : null}
        {props.failureGuidance ? <Row label={t('guidance')}>{props.failureGuidance}</Row> : null}
        <Row label={t('nextStep')}>{NEXT_STEPS.has(props.nextStep) ? t(`next_${props.nextStep}`) : props.nextStep}</Row>
      </dl>
      <p className="text-sm text-muted-foreground">{t('recorded')}</p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {props.attemptId ? (
          <Link href={href(AUTHENTICATION_ATTEMPT_RESOURCE, props.attemptId)} className="text-primary underline-offset-4 hover:underline">
            {t('openAttempt')}
          </Link>
        ) : null}
        <Link href={href(AUTHENTICATION_SESSION_RESOURCE, props.sessionId)} className="text-primary underline-offset-4 hover:underline">
          {t('openSession')}
        </Link>
        <span className="text-xs text-muted-foreground">{t('requestId', { params: { id: props.requestId } })}</span>
      </div>
    </section>
  );
}
