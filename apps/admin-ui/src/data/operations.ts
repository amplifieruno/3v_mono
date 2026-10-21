import type { HasuraOperationRegistry } from '@burojs/hasura';
import { INVITATION_BINDING } from '../modules/organization/invite-member';
import { OVERVIEW_BINDING } from '../modules/overview/kpis';

/** The named root field of a GraphQL answer, or `undefined`. */
function rootOf(data: unknown, field: string): unknown {
  return typeof data === 'object' && data !== null
    ? (data as Readonly<Record<string, unknown>>)[field]
    : undefined;
}

/**
 * The closed registry of custom GraphQL documents: tracked SQL functions and
 * Hasura actions the table roots cannot express. Keyed by the binding's
 * resource, then by the operation name a `defineQuery` / `defineMutation`
 * names in `binding.operation`; a descriptor never supplies its own document.
 * Modules add their entries here as they ship operations.
 */
export const HASURA_OPERATIONS: HasuraOperationRegistry = {
  [OVERVIEW_BINDING]: {
    /**
     * `dashboard_kpis(hasura_session)`: the session argument is filled by
     * Hasura from the token, so the field takes no arguments. It returns a
     * set of at most one row; none when the token names no organization.
     */
    dashboardKpis: {
      kind: 'query',
      document: `query DashboardKpis {
  dashboard_kpis {
    unique_visitors_today
    current_occupancy
    open_incidents
    open_incidents_critical
    devices_offline
    deliveries_failed_24h
  }
}`,
      variables: () => undefined,
      mapResult: (data) => {
        const rows = rootOf(data, 'dashboard_kpis');
        return Array.isArray(rows) ? (rows[0] ?? null) : null;
      },
    },
  },
  [INVITATION_BINDING]: {
    /** The `invite_member` action (`org_admin`): answers the one-time token once. */
    inviteMember: {
      kind: 'mutation',
      document: `mutation InviteMember($email: String!, $role: String!) {
  invite_member(email: $email, role: $role) { invitation_id token expires_at }
}`,
      variables: (input) => {
        const { email, role } = input as { email: string; role: string };
        return { email, role };
      },
      mapResult: (data) => rootOf(data, 'invite_member'),
    },
  },
};
