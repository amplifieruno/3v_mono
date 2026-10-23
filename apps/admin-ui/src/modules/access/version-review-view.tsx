import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { EnumBadge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { useEnumLabel } from '../../blocks/charts/use-enum-label';
import { ACCESS_EFFECT_ENUM } from '../../enums/access';
import { ACCESS_LEVEL_ENUM, PROFILE_TYPE_ENUM } from '../../enums/people';
import { formatWindows } from '../../fields/time-windows-format';
import { subjectText, targetText, validityText } from './version-content-format';
import { accessPolicyVersionContent } from './version-content-query';
import type { versionReviewBlock } from './version-review-block';

type Props = BlockViewProps<typeof versionReviewBlock>;

function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Items({ heading, items, empty }: { readonly heading: string; readonly items: readonly string[]; readonly empty: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-sm font-medium">{heading}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-destructive">{empty}</p>
      ) : (
        <ul className="list-disc pl-5 text-sm">
          {items.map((item, index) => (
            <li key={`${index}:${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The review of "Submit for approval" and "Approve" (`itap:access-policy-version-review`): what
 * the step does, then the version's settings and who and where it names, read fresh.
 */
export function VersionReviewView({ props, t }: Props): React.ReactElement {
  const versionId = props.versionId ?? null;
  const content = useCustomQuery(accessPolicyVersionContent, { versionId: versionId ?? '' }, { enabled: versionId !== null });
  const typeLabel = useEnumLabel(PROFILE_TYPE_ENUM);
  const levelLabel = useEnumLabel(ACCESS_LEVEL_ENUM);
  const intro = <p className="text-sm">{t(props.step === 'submit' ? 'submitIntro' : 'approveIntro')}</p>;

  let body: React.ReactNode;
  if (content.isError) body = <p className="text-sm text-destructive">{t('failed')}</p>;
  else if (content.data === undefined) body = <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  else if (content.data === null) body = <p className="text-sm text-destructive">{t('gone')}</p>;
  else {
    const version = content.data;
    const schedule = formatWindows(version.schedule, 'en');
    const subjects = version.access_policy_version_subjects.map((s) => subjectText(s, t, typeLabel, levelLabel));
    const targets = version.access_policy_version_targets.map((target) => targetText(target, t));
    body = (
      <>
        <h3 className="text-sm font-semibold">
          {t('heading', { params: { code: version.policy?.code ?? '', name: version.policy?.name ?? '', version: version.version } })}
        </h3>
        <dl className="flex flex-col gap-1 text-sm" aria-label={t('settings')}>
          <Row label={t('effect')}>
            <EnumBadge enumName={ACCESS_EFFECT_ENUM} value={version.effect} />
          </Row>
          <Row label={t('priority')}>{version.priority}</Row>
          <Row label={t('schedule')}>{schedule === '' ? t('always') : schedule}</Row>
          <Row label={t('validity')}>{validityText(version, t)}</Row>
          {version.effect === 'allow' ? (
            <Row label={t('maxRisk')}>{version.max_risk === null ? t('noLimit') : version.max_risk}</Row>
          ) : null}
        </dl>
        <Items heading={t('subjects', { params: { count: subjects.length } })} items={subjects} empty={t('none')} />
        <Items heading={t('targets', { params: { count: targets.length } })} items={targets} empty={t('none')} />
      </>
    );
  }
  return (
    <section className="flex flex-col gap-3" data-testid="policy-version-review" aria-label={t('label')}>
      {intro}
      {body}
    </section>
  );
}
