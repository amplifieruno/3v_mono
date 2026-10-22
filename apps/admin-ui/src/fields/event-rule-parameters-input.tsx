import { type ScalarInputProps, useT } from '@burojs/react';
import { Checkbox, Input, Label } from '@burojs/ui-shadcn';
import type * as React from 'react';
import {
  NO_PARAMETERS_NOTE,
  WATCH_LIST_KINDS,
  WATCH_LIST_KIND_LABELS,
  dwellMinutes,
  dwellSecondsOf,
  ruleTypeOf,
  toggleKind,
  watchListKinds,
  withParameter,
} from './event-rule-parameters-format';
import type { EventRuleParametersMeta } from './event-rule-parameters-meta';

/**
 * The parameters the rule's type reads: the dwell time in minutes (stored as seconds) for an
 * unusual-dwell rule, one box per watch-list kind for a watch-list rule (none ticked = every kind),
 * and for the other types a note saying where their thresholds come from. Every edit writes the
 * whole object, with keys the type does not read left as stored.
 */
export function EventRuleParametersInput(
  props: ScalarInputProps<unknown, EventRuleParametersMeta>,
): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, testIds, meta, issues } = props;
  const t = useT();
  const type = ruleTypeOf(props, meta.typeField);
  const locked = disabled === true || readOnly === true;
  const prefix = accessibility.input ?? 'rule-parameters';

  if (type === 'unusual_dwell') {
    const id = `${prefix}-dwell`;
    return (
      <div className="flex flex-col gap-1" data-testid={testIds.input} aria-describedby={accessibility.description}>
        <Label htmlFor={id}>
          {t('console.ruleParameters.dwell')}
          <span aria-hidden> *</span>
        </Label>
        <Input
          id={id}
          type="number"
          min={1}
          step={1}
          className="max-w-40"
          value={dwellMinutes(value)}
          disabled={locked}
          aria-invalid={issues.length > 0}
          onChange={(event) => onChange?.(withParameter(value, 'dwell_seconds', dwellSecondsOf(event.target.value)))}
          {...(onBlur === undefined ? {} : { onBlur })}
        />
        <span className="text-xs text-muted-foreground">{t('console.ruleParameters.dwellHint')}</span>
      </div>
    );
  }

  if (type === 'watchlist') {
    const chosen = new Set(watchListKinds(value));
    return (
      <fieldset className="flex flex-col gap-2" data-testid={testIds.input} aria-describedby={accessibility.description}>
        <legend className="text-sm font-medium">{t('console.ruleParameters.kinds')}</legend>
        <div className="flex flex-wrap gap-4">
          {WATCH_LIST_KINDS.map((kind) => {
            const id = `${prefix}-${kind}`;
            return (
              <div key={kind} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={chosen.has(kind)}
                  disabled={locked}
                  onCheckedChange={(checked) => onChange?.(toggleKind(value, kind, checked === true))}
                />
                <Label htmlFor={id}>{WATCH_LIST_KIND_LABELS[kind]}</Label>
              </div>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">{t('console.ruleParameters.kindsHint')}</span>
      </fieldset>
    );
  }

  const note = type === undefined ? undefined : NO_PARAMETERS_NOTE[type];
  return (
    <span className="text-sm text-muted-foreground" data-testid={testIds.input}>
      {note === undefined ? t('console.ruleParameters.none') : `${t('console.ruleParameters.none')} ${note}`}
    </span>
  );
}
