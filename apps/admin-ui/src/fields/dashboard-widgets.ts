import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, type JsonFieldOpts, f } from '@burojs/field-types';
import { dashboardProblems } from '../modules/analytics/dashboard-contract';
import { problemIssue } from './field-issue';

/** The field implementation id of {@link dashboardWidgetsField} (`./dashboard-widgets-impl.ts`). */
export const DASHBOARD_WIDGETS_FIELD = 'itap.dashboard-widgets';

/**
 * The dashboard contract and every widget's settings as a field validator: one issue per refusal,
 * each naming its widget, so the save is refused before it is sent (`dashboardProblems`).
 */
export function checkDashboardWidgets(): FieldValidator {
  const validate = (value: unknown) => {
    const problems = dashboardProblems(value ?? []);
    return problems.length === 0 ? null : problems.map(problemIssue);
  };
  // buro's runner accepts a list of issue objects from the function form (`./field-issue.ts`).
  return validate as unknown as FieldValidator;
}

/**
 * A dashboard's `widgets` jsonb, edited as a form per widget (`./dashboard-widgets-input.tsx`) and
 * checked with the database's contract (`../modules/analytics/dashboard-contract.ts`). Display: the
 * widgets by title in reading order.
 */
export function dashboardWidgetsField(opts: { readonly texts?: string | FieldTexts; readonly in?: JsonFieldOpts['in'] } = {}) {
  const base = f.json({
    default: [],
    validate: checkDashboardWidgets(),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
    ...(opts.in === undefined ? {} : { in: opts.in }),
  });
  return { ...base, ui: { ...base.ui, input: DASHBOARD_WIDGETS_FIELD, display: DASHBOARD_WIDGETS_FIELD }, meta: {} };
}
