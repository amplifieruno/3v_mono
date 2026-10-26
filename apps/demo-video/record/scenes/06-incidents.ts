import type { RecordedScene } from '../scene';
import { open, settle } from '../session';
import { autoRefreshOff, navTo, openRow, scrollTo } from '../ui';

/** Scene 6: the event feed, a critical incident escalating on its own, a dry run of the alert rule. */
export const incidents: RecordedScene = {
  id: 'incidents',
  beats: [
    {
      id: 'events',
      async prepare(page) {
        await open(page, '/events');
        await autoRefreshOff(page);
      },
      async record(page) {
        await page.waitForTimeout(4000);
      },
    },
    {
      id: 'incident',
      async prepare(page) {
        await navTo(page, 'Incidents');
        await autoRefreshOff(page);
        await openRow(page, ['Blacklist match', 'Critical']);
        await scrollTo(page, undefined, page.getByText('Escalation', { exact: true }), 400);
      },
      async record(page, m) {
        await page.waitForTimeout(1500);
        const escalation = page.getByText('Escalation', { exact: true }).first();
        await m.focus(escalation, 'escalation', 1.2);
        await page.waitForTimeout(1500);
        await m.shot('incident', escalation);
        await page.waitForTimeout(4500);
      },
    },
    {
      id: 'rule',
      async prepare(page) {
        await navTo(page, 'Notification rules');
        await openRow(page, ['Blacklist matches']);
      },
      async record(page, m) {
        await page.waitForTimeout(1500);
        await m.click(page.getByRole('button', { name: 'Test rule', exact: true }), 'Test rule');
        await m.wait('dry run', () => settle(page, 800));
        await page.waitForTimeout(800);
        await m.shot('rule-test', page.getByRole('dialog').getByText('match', { exact: false }));
        await page.waitForTimeout(4500);
      },
    },
  ],
};
