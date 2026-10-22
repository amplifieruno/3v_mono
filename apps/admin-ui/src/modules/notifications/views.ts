import { deliveryReportView } from '../../blocks/delivery-report/views';
import { notificationRuleTestView } from '../../blocks/notification-rule-test/views';

/** The views of the notifications module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const notificationsViews = [notificationRuleTestView, deliveryReportView] as const;
