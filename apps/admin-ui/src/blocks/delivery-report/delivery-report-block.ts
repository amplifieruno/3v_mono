import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { REPORT_PERIODS } from './delivery-report-query';

/**
 * "Deliveries by channel" (`itap:delivery-report`): the per-channel table of `delivery_report` for
 * one period (prop `period`: the last 24 hours, 7 or 30 days). One row per channel: total, waiting,
 * sent, delivered, failed, dead letters, in digests, acknowledged, the in-app acknowledgement rate
 * and response time, and escalation pages.
 */
export const deliveryReportBlock = defineBlock('itap:delivery-report', {
  texts: {
    label: 'Deliveries by channel',
    loading: 'Reading the report…',
    failed: 'The report could not be read.',
    channel: 'Channel',
    total: 'Total',
    pending: 'Waiting',
    sent: 'Sent',
    delivered: 'Delivered',
    failedCount: 'Failed',
    dead_letter: 'Dead letters',
    digested: 'In digests',
    acknowledged: 'Acknowledged',
    ack_rate: 'Ack rate',
    avg_response: 'Avg response',
    escalations: 'Escalations',
    note: 'Read {{time}}. Rates and response times are for in-app notifications; digest items are counted once, in their digest.',
  },
  props: {
    period: prop(z.enum(REPORT_PERIODS)).default('7d'),
  },
});
