import type { RecordedScene } from '../scene';
import { settle } from '../session';
import { navTo, openRow, scroll } from '../ui';

/** Scene 6: the event feed, a critical incident escalating on its own, a dry run of the alert rule. */
export const incidents: RecordedScene = {
  id: 'incidents',
  start: '/events',
  async record(page, m) {
    await m.shot('events');
    await page.waitForTimeout(2500);
    await navTo(page, m, 'Incidents');
    await openRow(page, m, ['Blacklist match', 'Critical']);
    await m.shot('incident', page.getByText('Escalation', { exact: false }));
    await page.waitForTimeout(1500);
    await scroll(page, m, 400, 1500);
    await page.waitForTimeout(1500);
    await navTo(page, m, 'Notification rules');
    await openRow(page, m, ['Blacklist matches']);
    await m.click(page.getByRole('button', { name: 'Test rule', exact: true }), 'Test rule');
    await m.wait('dry run', () => settle(page, 800));
    await m.shot('rule-test', page.getByRole('dialog').getByText('match', { exact: false }));
    await page.waitForTimeout(3500);
  },
};
