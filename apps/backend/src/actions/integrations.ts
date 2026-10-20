import { z } from 'zod';
import { encryptSecret, serverKeys } from '../auth-service/crypto.js';
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
