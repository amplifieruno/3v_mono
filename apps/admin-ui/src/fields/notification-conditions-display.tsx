import { type ScalarDisplayProps, useCustomQuery, useT } from '@burojs/react';
import { EnumBadge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { EVENT_SEVERITY_ENUM } from '../enums/events';
import {
  CONDITION_KEYS,
  type ConditionReferences,
  conditionValue,
  conditionsOf,
} from './notification-conditions-format';
import { notificationConditionReferences } from './notification-conditions-query';

type T = ReturnType<typeof useT>;

const LABEL_KEYS: Readonly<Record<string, string>> = {
  facility_id: 'console.notificationConditions.facility',
  area_id: 'console.notificationConditions.area',
  segment_id: 'console.notificationConditions.segment',
  min_severity: 'console.notificationConditions.minSeverity',
};

function nameOf(rows: readonly { readonly id: string; readonly name: string }[] | undefined, id: string, t: T): string {
  const row = rows?.find((candidate) => candidate.id.toLowerCase() === id.toLowerCase());
  return row?.name ?? t('console.notificationConditions.unknown', { params: { id } });
}

/** One condition as people read it; severities as their badge. */
function ConditionText({ name, value, refs, plain, t }: {
  readonly name: string;
  readonly value: unknown;
  readonly refs: ConditionReferences | undefined;
  readonly plain: boolean;
  readonly t: T;
}): React.ReactElement {
  const id = conditionValue(value, name as (typeof CONDITION_KEYS)[number]) ?? '';
  if (name === 'facility_id') return <>{nameOf(refs?.facilities, id, t)}</>;
  if (name === 'area_id') {
    return <>{t('console.notificationConditions.areaWithin', { params: { name: nameOf(refs?.areas, id, t) } })}</>;
  }
  if (name === 'segment_id') {
    return <>{t('console.notificationConditions.segmentAtEvent', { params: { name: nameOf(refs?.segments, id, t) } })}</>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <EnumBadge enumName={EVENT_SEVERITY_ENUM} value={id} {...(plain ? { presentation: 'plain' as const } : {})} />
      {t('console.notificationConditions.severityAndAbove')}
    </span>
  );
}

/**
 * The conditions as label and text pairs (one line in a list cell): the facility, the area with
 * the areas inside it, the segment and the minimum severity, named from the organization's
 * records; `{}` reads "every event of the rule's event types". A key the language does not know
 * is shown as stored, so nothing is hidden.
 */
export function NotificationConditionsDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  const conditions = conditionsOf(props.value);
  const keys = Object.keys(conditions);
  const refs = useCustomQuery(notificationConditionReferences, {}, { enabled: keys.some((key) => key.endsWith('_id')) });
  if (keys.length === 0) {
    return <span className="text-muted-foreground">{t('console.notificationConditions.every')}</span>;
  }
  const known = CONDITION_KEYS.filter((key) => key in conditions);
  const other = keys.filter((key) => !(CONDITION_KEYS as readonly string[]).includes(key));
  const plain = props.presentation === 'plain';
  const otherText = (key: string) =>
    t('console.notificationConditions.other', { params: { key, value: JSON.stringify(conditions[key]) } });
  if (plain) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2" data-testid={props.testIds.display}>
        {known.map((key, index) => (
          <span key={key} className="inline-flex items-center gap-1">
            {index > 0 ? <span aria-hidden>·</span> : null}
            <ConditionText name={key} value={conditions} refs={refs.data} plain t={t} />
          </span>
        ))}
        {other.map((key) => (
          <span key={key}>· {otherText(key)}</span>
        ))}
      </span>
    );
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" data-testid={props.testIds.display}>
      {known.map((key) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{t(LABEL_KEYS[key] ?? key)}</dt>
          <dd>
            <ConditionText name={key} value={conditions} refs={refs.data} plain={false} t={t} />
          </dd>
        </div>
      ))}
      {other.map((key) => (
        <div key={key} className="contents">
          <dt className="text-muted-foreground">{key}</dt>
          <dd>{JSON.stringify(conditions[key])}</dd>
        </div>
      ))}
    </dl>
  );
}
