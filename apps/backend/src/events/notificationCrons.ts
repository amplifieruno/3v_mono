import { perOrganizationCron } from './trackingCrons.js';

const ESCALATE = `
  mutation EscalateIncidents($organization: uuid!, $at: timestamptz!) {
    escalate_incidents(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;
const SEND_DIGESTS = `
  mutation SendDigests($organization: uuid!, $at: timestamptz!) {
    send_digests(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;

/** Cron `escalate` (every minute): next escalation step of unacknowledged open incidents via itap.escalate_incidents. */
export const escalate = perOrganizationCron('escalate_incidents', ESCALATE);

/** Cron `send_digests` (hourly): due digest items combined into one delivery per recipient via itap.send_digests. */
export const sendDigests = perOrganizationCron('send_digests', SEND_DIGESTS);
