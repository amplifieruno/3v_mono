import { z } from 'zod';
import { encryptSecret, serverKeys } from '../auth-service/crypto.js';
import { HasuraError } from '../hasura/client.js';
import { ActionError, defineAction } from './types.js';

const INTEGRATION = `
  query IntegrationForSecret($id: uuid!, $org: uuid!) {
    integrations(where: { id: { _eq: $id }, organization_id: { _eq: $org } }) { id }
  }
`;
const STORE = `
  mutation StoreIntegrationSecret($id: uuid!, $org: uuid!, $secret: String) {
    update_integrations(where: { id: { _eq: $id }, organization_id: { _eq: $org } }, _set: { secret: $secret }) {
      affected_rows
    }
  }
`;

/**
 * set_integration_secret(integration_id, secret?) (org_admin): stores the integration's credential encrypted
 * (AES-256-GCM `v2`, the integration id as additional data, server key AUTH_KEY_ENCRYPTION_KEY — the slice 9 crypto
 * helper), or clears it (null / empty). The plaintext never reaches the database or the audit log (column redacted).
 */
export const setIntegrationSecret = defineAction(
  z.object({ integration_id: z.string().uuid(), secret: z.string().max(4096).nullish() }),
  async (ctx) => {
    const org = ctx.session.organizationId?.toLowerCase();
    if (!org || ctx.session.role !== 'org_admin') throw new ActionError('forbidden', 'An organization admin session is required');
    const id = ctx.input.integration_id.toLowerCase();
    const { integrations } = await ctx.admin.request<{ integrations: { id: string }[] }>(INTEGRATION, { id, org });
    if (integrations.length === 0) throw new ActionError('integration_not_found', 'Integration not found');
    const plain = ctx.input.secret ?? '';
    let stored: string | null = null;
    if (plain !== '') {
      if (!ctx.env.AUTH_KEY_ENCRYPTION_KEY) {
        throw new ActionError('encryption_not_configured', 'AUTH_KEY_ENCRYPTION_KEY is not set');
      }
      stored = encryptSecret(serverKeys(ctx.env.AUTH_KEY_ENCRYPTION_KEY), plain, id);
    }
    await ctx.actor.request(STORE, { id, org, secret: stored });
    return { integration_id: id, has_secret: stored !== null };
  },
);

const REQUEST_SYNC = `
  mutation RequestIntegrationSync($org: uuid!, $id: uuid!, $actor: uuid) {
    request_integration_sync(args: { p_org: $org, p_integration: $id, p_trigger: "manual", p_actor: $actor }) {
      id integration_id status
    }
  }
`;
const SYNC_REFUSALS: Record<string, string> = {
  integration_not_found: 'Integration not found',
  integration_paused: 'The integration is paused',
  integration_sync_running: 'A sync of this integration is already running',
};

/**
 * run_integration_sync(integration_id) (org_admin): queues a manual sync run (itap.request_integration_sync); the
 * run_sync event trigger applies it asynchronously. Refusals: integration_not_found (also another organization's),
 * integration_paused, integration_sync_running.
 */
export const runIntegrationSync = defineAction(z.object({ integration_id: z.string().uuid() }), async (ctx) => {
  const org = ctx.session.organizationId?.toLowerCase();
  if (!org || ctx.session.role !== 'org_admin') throw new ActionError('forbidden', 'An organization admin session is required');
  try {
    const { request_integration_sync: rows } = await ctx.actor.request<{
      request_integration_sync: { id: string; integration_id: string; status: string }[];
    }>(REQUEST_SYNC, { org, id: ctx.input.integration_id.toLowerCase(), actor: ctx.session.userId ?? null });
    const run = rows[0];
    if (!run) throw new ActionError('integration_not_found', SYNC_REFUSALS.integration_not_found);
    return { run_id: run.id, integration_id: run.integration_id, status: run.status };
  } catch (error: unknown) {
    if (error instanceof HasuraError) {
      const text = `${error.detail ?? ''} ${error.message}`;
      const code = Object.keys(SYNC_REFUSALS).find((c) => text.includes(c));
      if (code) throw new ActionError(code, SYNC_REFUSALS[code]);
    }
    throw error;
  }
});
