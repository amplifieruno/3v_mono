import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { REPORT_PERIODS } from '../delivery-report/delivery-report-query';

/**
 * How notifications fared (`itap:deliveries`, `delivery_report`): the period's headline figures and,
 * per channel, its deliveries by outcome as one bar (every channel on one scale). Prop `period`:
 * the last 24 hours, 7 or 30 days. The full table is the Delivery report page's.
 */
export const deliveriesBlock = defineBlock('itap:deliveries', {
  texts: {
    label: 'Notification deliveries',
    loading: 'Reading the deliveries…',
    failed: 'The deliveries could not be read.',
    none: 'No notification was sent over the period.',
    total: 'Notifications',
    delivered: 'Delivered',
    problems: 'Failed or given up',
    ackRate: 'Acknowledged in-app',
    channelChart: 'Deliveries of {{channel}} by outcome',
    legend: 'Outcomes over every channel',
    outcome_delivered: 'Delivered',
    outcome_sent: 'Sent, not confirmed',
    outcome_pending: 'Waiting',
    outcome_failed: 'Failed, retried',
    outcome_dead_letter: 'Given up',
  },
  props: {
    period: prop(z.enum(REPORT_PERIODS)).default('7d'),
  },
});
