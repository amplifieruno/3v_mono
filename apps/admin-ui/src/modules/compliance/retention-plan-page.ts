import { defineCustomPage } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { retentionPlanBlock } from './retention-plan-block';

/** "Retention plan": the dry run of the nightly purge (`itap:retention-plan`), changing nothing. */
export const retentionPlanPage = defineCustomPage({
  name: 'retention-plan',
  icon: NAV_ICONS.retentionPlan,
  path: '/retention-plan',
  texts: 'Retention plan',
  section: NAV_SECTIONS.compliance,
  order: 20,
  body: (l) => [l.place(retentionPlanBlock, { key: 'plan' })],
});
