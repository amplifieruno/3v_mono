import { type ScalarInputProps, useT } from '@burojs/react';
import type * as React from 'react';
import { useEnumLabel } from '../blocks/charts/use-enum-label';
import { REPORT_PERIOD_ENUM, REPORT_PERIODS } from '../enums/reports';
import { ParamSelect, UNSET } from './dashboard-param-select';
import { readReportParameters, withPeriod } from './report-parameters';

/**
 * A template's period: what each scheduled run of it covers, the previous complete day, week or month
 * in the schedule's time zone ("Default" removes the key: the previous day). Other keys stay as stored.
 */
export function ReportParametersInput(props: ScalarInputProps<unknown>): React.ReactElement {
  const { value, onChange, onBlur, disabled, readOnly, accessibility, issues } = props;
  const t = useT();
  const periodLabel = useEnumLabel(REPORT_PERIOD_ENUM);
  const { period } = readReportParameters(value);
  const options = [
    { value: UNSET, label: t('console.reportParameters.defaultPeriod') },
    ...REPORT_PERIODS.map((p) => ({ value: p, label: periodLabel(p) })),
  ];
  return (
    <ParamSelect
      id={accessibility.input ?? 'report-period'}
      value={period ?? UNSET}
      options={options}
      disabled={disabled === true || readOnly === true}
      invalid={issues.length > 0}
      onChange={(next) => {
        const chosen = REPORT_PERIODS.find((p) => p === next) ?? null;
        onChange?.(withPeriod(value, chosen));
        onBlur?.();
      }}
    />
  );
}
