import { type ScalarInputProps, useCustomQuery, useT } from '@burojs/react';
import type * as React from 'react';
import { EnumBadge } from '@burojs/ui-shadcn';
import { EVENT_SEVERITIES, EVENT_SEVERITY_ENUM } from '../enums/events';
import { ConditionRow, type ConditionChoice } from './notification-condition-row';
import {
  type ConditionKey,
  type ConditionReferences,
  areaChoices,
  conditionValue,
  issueNode,
  validateConditions,
  withCondition,
  withFacility,
} from './notification-conditions-format';
import { notificationConditionReferences } from './notification-conditions-query';

function choicesOf(key: ConditionKey, value: unknown, refs: ConditionReferences): ConditionChoice[] {
  if (key === 'facility_id') return refs.facilities.map((row) => ({ value: row.id, label: row.name }));
  if (key === 'segment_id') return refs.segments.map((row) => ({ value: row.id, label: row.name }));
  if (key === 'area_id') {
    const facilityChosen = conditionValue(value, 'facility_id') !== undefined;
    const facilityName = (id: string) => refs.facilities.find((row) => row.id === id)?.name;
    return areaChoices(value, refs).map((row) => {
      const facility = facilityChosen ? undefined : facilityName(row.facility_id);
      return { value: row.id, label: facility === undefined ? row.name : `${row.name} (${facility})` };
    });
  }
  return EVENT_SEVERITIES.map((severity) => ({
    value: severity,
    label: <EnumBadge enumName={EVENT_SEVERITY_ENUM} value={severity} presentation="plain" />,
  }));
}

const ROWS: readonly { key: ConditionKey; label: string; any: string; hint: string }[] = [
  { key: 'facility_id', label: 'facility', any: 'anyFacility', hint: 'facilityHint' },
  { key: 'area_id', label: 'area', any: 'anyArea', hint: 'areaHint' },
  { key: 'segment_id', label: 'segment', any: 'anySegment', hint: 'segmentHint' },
  { key: 'min_severity', label: 'minSeverity', any: 'anySeverity', hint: 'minSeverityHint' },
];

/**
 * The conditions as one row per condition of the language (facility, area, segment, minimum
 * severity), each "any" or a record of the organization. The area list follows the chosen
 * facility, and changing the facility drops an area outside it, so the editor offers no
 * combination the database refuses. A stored id that names nothing any more stays visible and is
 * flagged on its row; a validation issue of a condition marks that row.
 */
export function NotificationConditionsInput(props: ScalarInputProps<unknown>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, issues } = props;
  const t = useT();
  const refs = useCustomQuery(notificationConditionReferences, {});
  const locked = disabled === true || readOnly === true;
  const prefix = accessibility.input ?? 'notification-conditions';
  if (refs.isError) return <p className="text-sm text-destructive">{t('console.notificationConditions.failed')}</p>;
  if (refs.data === undefined) {
    return <p className="text-sm text-muted-foreground">{t('console.notificationConditions.loading')}</p>;
  }
  const data = refs.data;
  const referenceProblem = validateConditions(value ?? {}, data);
  const flagged = new Set(issues.flatMap((issue) => {
    const node = issueNode(issue);
    return node === undefined ? [] : [node];
  }));
  const change = (key: ConditionKey, next: string | undefined): void => {
    onChange?.(key === 'facility_id' ? withFacility(value, next, data) : withCondition(value, key, next));
  };
  const facilityChosen = conditionValue(value, 'facility_id') !== undefined;
  return (
    <fieldset className="flex flex-col gap-3" data-testid={testIds.input} aria-describedby={accessibility.description}>
      <p className="text-xs text-muted-foreground">{t('console.notificationConditions.allOf')}</p>
      {ROWS.map((row) => {
        const own = referenceProblem?.node === row.key ? referenceProblem : null;
        const hint = row.key === 'area_id' && facilityChosen ? 'areaOfFacilityHint' : row.hint;
        return (
          <ConditionRow
            key={row.key}
            id={`${prefix}-${row.key}`}
            label={t(`console.notificationConditions.${row.label}`)}
            anyLabel={t(`console.notificationConditions.${row.any}`)}
            hint={t(`console.notificationConditions.${hint}`)}
            current={conditionValue(value, row.key)}
            choices={choicesOf(row.key, value, data)}
            unknownLabel={(id) => t('console.notificationConditions.unknown', { params: { id } })}
            problem={own === null ? undefined : t(`validation.itap.${own.code}`, { params: own.params ?? {} })}
            invalid={own !== null || flagged.has(row.key)}
            disabled={locked}
            onChange={(next) => change(row.key, next)}
            {...(onBlur === undefined ? {} : { onBlur })}
          />
        );
      })}
    </fieldset>
  );
}
