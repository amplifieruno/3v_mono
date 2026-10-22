import { type ScalarDisplayProps, useT } from '@burojs/react';
import type * as React from 'react';
import { useEnumLabel } from '../blocks/charts/use-enum-label';
import { REPORT_PERIOD_ENUM } from '../enums/reports';
import { readReportParameters } from './report-parameters';

/** `Previous week · time zone Europe/Moscow`; `—` when neither is set (the defaults apply). */
export function ReportParametersDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  const periodLabel = useEnumLabel(REPORT_PERIOD_ENUM);
  const { period, timezone } = readReportParameters(props.value);
  const parts = [
    period === null ? null : periodLabel(period),
    timezone === null ? null : t('console.reportParameters.timezone', { params: { zone: timezone } }),
  ].filter((part): part is string => part !== null);
  if (parts.length === 0) return <span className="text-muted-foreground">{t('console.reportParameters.defaults')}</span>;
  return <span data-testid={props.testIds.display}>{parts.join(' · ')}</span>;
}
