import type { HasuraClient } from '../hasura/client.js';

/** GraphQL operations of the face authentication service (admin secret; SQL functions are admin-only). */

export type KeyRecord = {
  id: string;
  organization_id: string;
  application_id: string;
  secret: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  application: { status: string; is_sandbox: boolean } | null;
};

export type SessionRow = {
  id: string;
  organization_id: string;
  application_id: string;
  mode: string;
  access_point_id: string | null;
  device_ref: string | null;
  nonce_hash: string;
  status: string;
  step: string;
  step_count: number;
  recapture_count: number;
  expires_at: string;
};

export type PublicDecision = {
  attempt_id: string | null;
  session_id: string;
  outcome: 'success' | 'partial_match' | 'failure';
  matched_identity_id: string | null;
  confidence: number | null;
  threshold_used: number | null;
  failure_reason: string | null;
  attack_outcome: string;
  attributes: Record<string, unknown>;
  session_status: string;
  session_step: string;
  step_count: number;
  recapture_count: number;
  expires_at: string;
};

export type SessionState = {
  session_id: string;
  mode: string;
  status: string;
  step: string;
  step_count: number;
  recapture_count: number;
  expires_at: string;
  last_outcome: string | null;
  last_failure_reason: string | null;
  review_status: string | null;
  matched_identity_id: string | null;
  attributes: Record<string, unknown>;
};

const SESSION_FIELDS = `id organization_id application_id mode access_point_id device_ref nonce_hash status step step_count
  recapture_count expires_at`;
const DECISION_FIELDS = `attempt_id session_id outcome matched_identity_id confidence threshold_used failure_reason
  attack_outcome attributes session_status session_step step_count recapture_count expires_at`;

const KEY = `
  query AuthServiceKey($prefix: String!) {
    client_application_keys(where: { key_prefix: { _eq: $prefix } }) {
      id organization_id application_id secret expires_at revoked_at last_used_at
      application { status is_sandbox }
    }
  }
`;
const TOUCH_KEY = `
  mutation AuthServiceTouchKey($id: uuid!, $at: timestamptz!) {
    update_client_application_keys(where: { id: { _eq: $id } }, _set: { last_used_at: $at }) { affected_rows }
  }
`;
const OPEN_SESSION = `
  mutation AuthOpenSession($args: auth_open_session_args!) { auth_open_session(args: $args) { ${SESSION_FIELDS} } }
`;
const SESSION = `
  query AuthServiceSession($org: uuid!, $app: uuid!, $id: uuid!) {
    authentication_sessions(where: { organization_id: { _eq: $org }, application_id: { _eq: $app }, id: { _eq: $id } }) {
      ${SESSION_FIELDS}
    }
  }
`;
const DECIDE = `
  mutation AuthServiceDecide($args: auth_service_decide_args!) { auth_service_decide(args: $args) { ${DECISION_FIELDS} } }
`;
const SECOND_FACTOR = `
  mutation AuthSecondFactor($args: auth_second_factor_args!) { auth_second_factor(args: $args) { ${DECISION_FIELDS} } }
`;
const STATE = `
  query AuthSessionState($args: auth_session_state_args!) {
    auth_session_state(args: $args) {
      session_id mode status step step_count recapture_count expires_at last_outcome last_failure_reason review_status
      matched_identity_id attributes
    }
  }
`;
const PING = `query AuthServicePing { organizations(limit: 1) { id } }`;

export function createAuthStore(admin: HasuraClient) {
  return {
    async keyByPrefix(prefix: string): Promise<KeyRecord | undefined> {
      const data = await admin.request<{ client_application_keys: KeyRecord[] }>(KEY, { prefix });
      return data.client_application_keys[0];
    },
    async touchKey(id: string, at: Date): Promise<void> {
      await admin.request(TOUCH_KEY, { id, at: at.toISOString() });
    },
    async openSession(args: Record<string, unknown>): Promise<SessionRow> {
      const data = await admin.request<{ auth_open_session: SessionRow[] }>(OPEN_SESSION, { args });
      return data.auth_open_session[0];
    },
    async session(org: string, app: string, id: string): Promise<SessionRow | undefined> {
      const data = await admin.request<{ authentication_sessions: SessionRow[] }>(SESSION, { org, app, id });
      return data.authentication_sessions[0];
    },
    async decide(args: Record<string, unknown>): Promise<PublicDecision> {
      const data = await admin.request<{ auth_service_decide: PublicDecision[] }>(DECIDE, { args });
      return data.auth_service_decide[0];
    },
    async secondFactor(args: Record<string, unknown>): Promise<PublicDecision> {
      const data = await admin.request<{ auth_second_factor: PublicDecision[] }>(SECOND_FACTOR, { args });
      return data.auth_second_factor[0];
    },
    async sessionState(org: string, app: string, id: string): Promise<SessionState | undefined> {
      const data = await admin.request<{ auth_session_state: SessionState[] }>(STATE, {
        args: { p_org: org, p_app: app, p_session: id },
      });
      return data.auth_session_state[0];
    },
    async ping(): Promise<void> {
      await admin.request(PING);
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;
