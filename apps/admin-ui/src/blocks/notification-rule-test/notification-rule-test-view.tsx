import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@burojs/ui-shadcn';
import * as React from 'react';
import type { notificationRuleTestBlock } from './notification-rule-test-block';
import {
  TEST_LIMITS,
  isRuleGone,
  notificationUserNames,
  recipientUserIds,
  testNotificationRule,
  testSummary,
} from './notification-rule-test-query';
import { NotificationRuleTestTable } from './notification-rule-test-table';

type Props = BlockViewProps<typeof notificationRuleTestBlock>;

/**
 * The rule test (`itap:notification-rule-test`): runs as soon as it opens, against the latest
 * 20 events (50 or 100 on request), and again on "Test again" (the rule may have been changed
 * meanwhile). A summary line, then the events with their outcome and recipients.
 */
export function NotificationRuleTestView({ props, t }: Props): React.ReactElement {
  const ruleId = props.ruleId ?? null;
  const [limit, setLimit] = React.useState<number>(TEST_LIMITS[0]);
  const test = useCustomQuery(testNotificationRule, { ruleId: ruleId ?? '', limit }, { enabled: ruleId !== null });
  const rows = test.data ?? [];
  const ids = recipientUserIds(rows);
  const names = useCustomQuery(notificationUserNames, { ids }, { enabled: ids.length > 0 });
  const id = 'rule-test-limit';
  const summary = testSummary(rows);

  let body: React.ReactNode;
  if (test.isError) body = <p className="text-sm text-destructive">{t(isRuleGone(test.error) ? 'gone' : 'failed')}</p>;
  else if (test.data === undefined) body = <p className="text-sm text-muted-foreground">{t('running')}</p>;
  else if (rows.length === 0) body = <p className="text-sm text-muted-foreground">{t('none')}</p>;
  else {
    body = (
      <>
        <p className="text-sm font-medium" data-testid="rule-test-summary" aria-live="polite">
          {summary.matched === 0 ? t('noMatch', { params: summary }) : t('summary', { params: summary })}
        </p>
        {summary.matched > 0 && summary.notifications === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noRecipients')}</p>
        ) : null}
        <NotificationRuleTestTable rows={rows} names={names.data ?? {}} t={t} />
        <p className="text-xs text-muted-foreground">
          {t('tested', { params: { time: new Date(test.dataUpdatedAt).toLocaleTimeString() } })}
        </p>
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4" data-testid="notification-rule-test" aria-label={t('label')}>
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={id}>{t('events')}</Label>
          <Select value={String(limit)} onValueChange={(next) => setLimit(Number(next))}>
            <SelectTrigger id={id} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEST_LIMITS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" disabled={ruleId === null || test.isFetching} onClick={() => void test.refetch()}>
          {test.isFetching ? t('running') : t('run')}
        </Button>
      </div>
      {body}
    </section>
  );
}
