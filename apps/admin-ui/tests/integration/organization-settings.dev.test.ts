import {
  type AuthContext,
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkRange } from '../../src/fields/bounded-number';
import { createItapHasuraProvider } from '../../src/data/provider';
import { SETTINGS_RANGES, SETTINGS_RESOURCE } from '../../src/modules/organization/settings';
import {
  ADMIN_EMAIL,
  DEV_GRAPHQL,
  DEV_STACK_ENABLED,
  NOVA_NAME,
  signInDev,
} from '../support/dev-stack';

/**
 * The settings row of Nova Tower through the console's own Hasura provider, as
 * `org_admin`: keyed by `organization_id`, the twelve settings writable, and
 * every column with a CHECK constraint refusing on the server what the form
 * refuses before any request.
 * The one successful write sets every setting to its current value.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'organization-settings-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

const ref = { namespace: 'default', id: SETTINGS_RESOURCE };

/** The columns with a database CHECK, and the value just past each end of it. */
const CHECKED: readonly (readonly [keyof typeof SETTINGS_RANGES, number])[] = [
  ['policy_revocation_bound_seconds', 9],
  ['policy_revocation_bound_seconds', 3601],
  ['face_credential_cooldown_seconds', 0],
  ['face_credential_cooldown_seconds', 3601],
  ['consent_embedding_retention_days', 0],
  ['consent_embedding_retention_days', 3651],
  ['abnormal_movement_max_count', -1],
  ['abnormal_movement_min_total', 0],
];

describe.skipIf(!DEV_STACK_ENABLED)(
  'organization settings against the dev stack (Nova Tower)',
  () => {
    let provider: DataProvider;
    let organizationId = '';

    function update(input: Record<string, unknown>) {
      const descriptor = createMutationDescriptor({
        ...IDENTITY,
        kind: 'updateOne',
        ref,
        resource: SETTINGS_RESOURCE,
        idField: 'organization_id',
        id: organizationId,
        input,
      } as never);
      return provider.mutations?.updateOne?.(descriptor as never, context());
    }

    beforeAll(async () => {
      const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
      organizationId = (await auth.getIdentity({} as AuthContext))?.organizationId ?? '';
      expect(organizationId).not.toBe('');
      provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    });

    it('should read the row by organization id and accept every setting at its current value', async () => {
      const read = createQueryDescriptor({
        ...IDENTITY,
        kind: 'one',
        ref,
        resource: SETTINGS_RESOURCE,
        id: organizationId,
      } as never);
      const row = (
        (await provider.queries?.one?.(read as never, context())) as {
          data: Record<string, unknown>;
        }
      ).data;
      expect(row.organization_id).toBe(organizationId);
      expect(typeof row.policy_epoch).toBe('number');

      const current = Object.fromEntries(
        Object.keys(SETTINGS_RANGES).map((name) => [name, row[name]]),
      );
      for (const [name, value] of Object.entries(current)) {
        expect(
          checkRange(value, SETTINGS_RANGES[name as keyof typeof SETTINGS_RANGES]),
          `${name}=${String(value)}`,
        ).toBeNull();
      }
      expect(await update(current)).toMatchObject({ record: current });
    });

    it('should be refused by the server exactly where the form refuses', async () => {
      for (const [name, value] of CHECKED) {
        expect(
          checkRange(value, SETTINGS_RANGES[name]),
          `${name}=${value} in the form`,
        ).not.toBeNull();
        // Hasura reports a CHECK violation to a non-admin role as `permission-error` (the provider's
        // `forbidden`), with the constraint in the message: `tasks/ui/buro-gaps.md` G14.
        await expect(
          update({ [name]: value }),
          `${name}=${value} on the server`,
        ).rejects.toMatchObject({
          kind: 'forbidden',
          code: 'permission-error',
          message: expect.stringContaining('Check constraint violation'),
        });
      }
    });
  },
);
