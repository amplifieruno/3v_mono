import {
  type AuthContext,
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { validateStringList } from '../../src/fields/string-list-format';
import { customAttributeFields } from '../../src/modules/organization/custom-attributes';
import { USER_SETTINGS_RESOURCE, checkLocale } from '../../src/modules/organization/user-settings';
import {
  ADMIN_EMAIL,
  DEV_GRAPHQL,
  DEV_STACK_ENABLED,
  NOVA_NAME,
  signInDev,
} from '../support/dev-stack';
import { CUSTOM_ATTRIBUTE_RESOURCE } from '../../src/data/resource-names';

/**
 * Custom attribute definitions and the user's own preferences of Nova Tower through
 * the console's provider, as `org_admin`: seeded definitions pass the console's checks,
 * a select attribute round-trips its options, the server refuses a select without
 * options and a malformed key as the form does, and the own `user_settings` row is
 * the only one visible and can be updated. Everything changed is restored.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'custom-attributes-dev-test',
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

const keyCheck = customAttributeFields.key.opts.validate as (value: unknown) => string | null;

describe.skipIf(!DEV_STACK_ENABLED)('custom attributes and preferences (Nova Tower)', () => {
  let provider: DataProvider;
  let userId = '';
  let saved: Record<string, unknown> = { locale: null, timezone: null };
  const created: string[] = [];

  const mutate = (resource: string, idField: string, input: Record<string, unknown>) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({
        ...IDENTITY,
        ref: { namespace: 'default', id: resource },
        resource,
        idField,
        ...input,
      } as never) as never,
      context(),
    );

  const query = (resource: string, input: Record<string, unknown>) =>
    provider.queries?.[input.kind as 'one']?.(
      createQueryDescriptor({
        ...IDENTITY,
        ref: { namespace: 'default', id: resource },
        resource,
        ...input,
      } as never) as never,
      context(),
    );

  const list = async (resource: string) =>
    (
      (await query(resource, { kind: 'list', pagination: { page: 1, pageSize: 100 } })) as {
        data: readonly Record<string, unknown>[];
      }
    ).data;

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    userId = (await auth.getIdentity({} as AuthContext))?.id ?? '';
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  });

  afterAll(async () => {
    for (const id of created)
      await mutate(CUSTOM_ATTRIBUTE_RESOURCE, 'id', { kind: 'deleteOne', id });
    if (userId !== '') {
      await mutate(USER_SETTINGS_RESOURCE, 'user_id', {
        kind: 'updateOne',
        id: userId,
        input: saved,
      });
    }
  });

  it('should accept every seeded definition', async () => {
    const rows = await list(CUSTOM_ATTRIBUTE_RESOURCE);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(keyCheck(row.key), String(row.key)).toBeNull();
      if (row.data_type === 'enum') {
        expect(validateStringList(row.options, { item: 'Option' }), String(row.key)).toBeNull();
      }
    }
  });

  it('should round-trip the options of a select attribute', async () => {
    const options = ['day', 'night', 'on call'];
    const result = (await mutate(CUSTOM_ATTRIBUTE_RESOURCE, 'id', {
      kind: 'createOne',
      input: {
        entity: 'profile',
        key: `dev_test_${Date.now()}`,
        label: 'Dev test shift',
        data_type: 'enum',
        options,
      },
    })) as { record: Record<string, unknown> };
    const id = String(result.record.id);
    created.push(id);
    const { data } = (await query(CUSTOM_ATTRIBUTE_RESOURCE, { kind: 'one', id })) as {
      data: Record<string, unknown>;
    };
    expect(data.options).toEqual(options);
  });

  it('should be refused by the server where the form refuses no options or a malformed key', async () => {
    const base = { entity: 'profile', label: 'Dev test refused', data_type: 'string' };
    const refused: readonly Record<string, unknown>[] = [
      { ...base, key: `dev_test_none_${Date.now()}`, data_type: 'enum', options: null },
      { ...base, key: `dev_test_empty_${Date.now()}`, data_type: 'enum', options: [] },
      { ...base, key: 'Dev-Test' },
    ];
    expect(validateStringList([], { item: 'Option' })).not.toBeNull();
    expect(keyCheck('Dev-Test')).not.toBeNull();
    for (const input of refused) {
      await expect(
        mutate(CUSTOM_ATTRIBUTE_RESOURCE, 'id', { kind: 'createOne', input }),
        JSON.stringify(input),
      ).rejects.toMatchObject({ message: expect.stringContaining('Check constraint violation') });
    }
  });

  it('should show only the own preferences row and update it', async () => {
    const rows = await list(USER_SETTINGS_RESOURCE);
    expect(rows.length).toBeLessThanOrEqual(1);
    for (const row of rows) expect(row.user_id).toBe(userId);
    saved = { locale: rows[0]?.locale ?? null, timezone: rows[0]?.timezone ?? null };
    if (rows.length === 0) {
      await mutate(USER_SETTINGS_RESOURCE, 'user_id', {
        kind: 'createOne',
        input: { locale: 'de-AT' },
      });
    } else {
      await mutate(USER_SETTINGS_RESOURCE, 'user_id', {
        kind: 'updateOne',
        id: userId,
        input: { locale: 'de-AT', timezone: 'Europe/Vienna' },
      });
    }
    expect(checkLocale('de-AT')).toBeNull();
    const { data } = (await query(USER_SETTINGS_RESOURCE, { kind: 'one', id: userId })) as {
      data: Record<string, unknown>;
    };
    expect(data).toMatchObject({ user_id: userId, locale: 'de-AT' });
  });
});
