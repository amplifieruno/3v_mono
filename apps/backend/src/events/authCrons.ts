import { perOrganizationCron } from './trackingCrons.js';

const EXPIRE_SESSIONS = `
  mutation ExpireAuthSessions($organization: uuid!, $at: timestamptz!) {
    expire_auth_sessions(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;

/**
 * Cron `expire_auth_sessions` (every minute, at scheduled_time): open face authentication sessions past expires_at
 * become `expired` (review sessions are never touched; a retry of the same run is a no-op).
 */
export const expireAuthSessions = perOrganizationCron('expire_auth_sessions', EXPIRE_SESSIONS);
