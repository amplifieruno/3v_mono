import { implementBlock } from '@burojs/react';
import { notificationRuleTestBlock } from './notification-rule-test-block';
import { NotificationRuleTestView } from './notification-rule-test-view';

/** The rule test's view, for `<BuroProvider blockImplementations>` (via the notifications views). */
export const notificationRuleTestView = implementBlock(notificationRuleTestBlock, { component: NotificationRuleTestView });
