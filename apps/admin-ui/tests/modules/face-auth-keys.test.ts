import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { selectFieldsOf } from '../../src/data/mapping';
import {
  CLIENT_APPLICATION_FACILITY_RESOURCE,
  CLIENT_APPLICATION_KEY_RESOURCE,
  CLIENT_APPLICATION_RESOURCE,
} from '../../src/data/resource-names';
import { ACTION_REFUSALS, HASURA_OPERATIONS, ITAP_TABLES } from '../../src/modules';
import { FACE_AUTH_BINDING } from '../../src/modules/face-auth/application-ops';
import { bindingOfRevoked } from '../../src/modules/face-auth/application-rules';
import { TARGET_FORM_FIELDS } from '../../src/modules/face-auth/binding-targets';
import { clientKeyFields } from '../../src/modules/face-auth/key';
import { expiryInPast } from '../../src/modules/face-auth/key-flows';

/**
 * API keys without the UI: "Rotate key" asks for an optional future expiry and opens the secret
 * block with the action's answer (Review Focus 1); no read of keys can select the secret; a third
 * active key, a revoked application and a past expiry read as sentences (Review Focus 2); "Revoke
 * key" is offered on an active key only (terminal). Also: a revoked application's bindings are not
 * removed, and the place pickers leave out places out of service.
 */

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', roles: ['org_admin'] };
const APP = '99999999-9999-4999-8999-000000000011';
const KEY = '99999999-9999-4999-8999-000000000012';
const SECRET = 'one-time-secret-value';

const application = (extra: Record<string, unknown> = {}) => ({
  id: APP,
  code: 'APP-00011',
  name: 'Kiosk',
  platform: 'kiosk',
  status: 'active',
  is_sandbox: false,
  ...extra,
});
const key = (extra: Record<string, unknown> = {}) => ({ id: KEY, application_id: APP, key_prefix: 'Ab12Cd34', revoked_at: null, ...extra });

const issued = { key_id: KEY, application_id: APP, prefix: 'Ab12Cd34', secret: SECRET, expires_at: null };

const flow = (resource: string, action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource, action }, { user: ADMIN, record, rows: { [resource]: [record] }, mutations: mutations as never });

beforeAll(async () => {
  await app.ready;
});

describe('Rotate key (Review Focus 1)', () => {
  it('should rotate without an expiry and open the secret block with the answer', async () => {
    const run = await flow(CLIENT_APPLICATION_RESOURCE, 'rotate_key', application(), { 'itap:rotate-client-key': [answer(issued)] }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { applicationId: APP, expiresAt: null } });
    expect(run.state.effects?.open).toMatchObject({ block: expect.anything(), props: { prefix: 'Ab12Cd34', secret: SECRET, expiresAt: null } });
  });

  it('should refuse an expiry that is not in the future before sending', async () => {
    const run = await flow(CLIENT_APPLICATION_RESOURCE, 'rotate_key', application(), { 'itap:rotate-client-key': [answer(issued)] }).open();
    run.fill({ expires_at: '2020-01-01T10:00:00.000Z' });
    await run.submit();
    run.assertNotSubmitted();
    expect(expiryInPast(null)).toBe(false);
    expect(expiryInPast('2999-01-01T00:00:00Z')).toBe(false);
    expect(expiryInPast('2020-01-01T00:00:00Z')).toBe(true);
  });

  it('should not rotate a key of a revoked application, saying why', async () => {
    (await flow(CLIENT_APPLICATION_RESOURCE, 'rotate_key', application({ status: 'revoked' })).open()).assertDisabled(/application is revoked/);
  });

  it('should send the expiry as an instant and keep the secret out of every read', () => {
    const rotate = HASURA_OPERATIONS[FACE_AUTH_BINDING]?.rotateClientKey;
    expect(rotate?.variables?.({ applicationId: APP, expiresAt: '2030-05-01T12:00:00.000Z' })).toEqual({
      application: APP,
      expires: '2030-05-01T12:00:00.000Z',
    });
    expect(rotate?.variables?.({ applicationId: APP, expiresAt: null })).toEqual({ application: APP, expires: null });
    expect(rotate?.mapResult?.({ rotate_client_key: issued })).toEqual(issued);
    const selected = ITAP_TABLES[CLIENT_APPLICATION_KEY_RESOURCE]?.selectFields ?? [];
    expect(selected).toEqual(selectFieldsOf(clientKeyFields));
    expect(selected.some((column) => /secret/u.test(column))).toBe(false);
    // Only the rotation's own answer carries a secret; no query does.
    const documents = Object.values(HASURA_OPERATIONS).flatMap((ops) => Object.entries(ops ?? {}));
    const withSecret = documents.filter(([, entry]) => /client_application_keys|rotate_client_key/u.test(entry.document) && /\bsecret\b/u.test(entry.document));
    expect(withSecret.map(([name]) => name)).toEqual(['rotateClientKey']);
  });
});

describe('refusals (Review Focus 2)', () => {
  const failing = (error: DataError) =>
    withActionRefusals(defineDataProvider({ mutations: { custom: defineMutationHandler(async () => Promise.reject(error)) } }), ACTION_REFUSALS);
  const call = (operation: string) => ({ kind: 'custom', resource: FACE_AUTH_BINDING, operation, input: {} }) as never;
  const actionRefusal = (code: string): DataError => ({
    kind: 'protocol',
    code,
    message: code.replace(/_/gu, ' '),
    details: [{ message: code.replace(/_/gu, ' '), extensions: { code } }],
  });
  const sqlRefusal = (message: string): DataError => ({
    kind: 'sent',
    code: 'permission-error',
    message,
    details: [{ message, extensions: { code: 'permission-error' } }],
  });

  it('should read a third active key as the limit sentence, not as "may have been applied"', async () => {
    await expect(failing(actionRefusal('client_key_limit')).mutations?.custom?.(call('rotateClientKey'), {} as never)).rejects.toMatchObject({
      kind: 'validation',
      code: 'client_key_limit',
      details: { issues: [{ message: { default: expect.stringMatching(/already has two active keys.*Revoke the key it no longer uses/) } }] },
    });
  });

  it('should read the other rotate refusals, and leave unknown codes alone', async () => {
    for (const [code, text] of [
      ['client_application_revoked', /revoked/],
      ['client_key_expiry_invalid', /must be in the future/],
      ['client_application_not_found', /no longer exists/],
      ['no_organization', /no organization/],
      ['organization_required', /no organization/],
      ['member_required', /active member of the organization can rotate keys/],
    ] as const) {
      await expect(failing(actionRefusal(code)).mutations?.custom?.(call('rotateClientKey'), {} as never)).rejects.toMatchObject({
        kind: 'validation',
        details: { issues: [{ message: { default: expect.stringMatching(text) } }] },
      });
    }
    await expect(failing(actionRefusal('internal')).mutations?.custom?.(call('rotateClientKey'), {} as never)).rejects.toMatchObject({ kind: 'protocol' });
  });

  it('should read a second revocation as "already revoked"', async () => {
    await expect(
      failing(sqlRefusal('Check constraint violation. client_key_revoked')).mutations?.custom?.(call('revokeClientKey'), {} as never),
    ).rejects.toMatchObject({ kind: 'validation', code: 'client_key_revoked' });
  });
});

describe('Revoke key', () => {
  it('should revoke an active key by its id', async () => {
    const run = await flow(CLIENT_APPLICATION_KEY_RESOURCE, 'revoke_key', key(), {
      'itap:revoke-client-key': [answer({ id: KEY, key_prefix: 'Ab12Cd34', revoked_at: '2026-10-23T05:00:00Z' })],
    }).open();
    await run.submit();
    await run.accept();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { keyId: KEY } });
    const revoke = HASURA_OPERATIONS[FACE_AUTH_BINDING]?.revokeClientKey;
    expect(revoke?.variables?.({ keyId: KEY })).toEqual({ key: KEY });
    expect(revoke?.mapResult?.({ revoke_client_key: [{ id: KEY }] })).toEqual({ id: KEY });
    expect(revoke?.mapResult?.({ revoke_client_key: [] })).toBeNull();
  });

  it('should not offer revoking a revoked key (terminal)', async () => {
    (await flow(CLIENT_APPLICATION_KEY_RESOURCE, 'revoke_key', key({ revoked_at: '2026-10-01T00:00:00Z' })).open()).assertUnavailable();
  });
});

describe('Task 1 follow-ups', () => {
  it('should not remove a binding of a revoked application', () => {
    const binding = (status: string) => ({ record: { id: 'b1', application_id: APP, application: { status } } });
    expect(bindingOfRevoked(binding('revoked'))).toBe(true);
    expect(bindingOfRevoked(binding('active'))).toBe(false);
    expect(ITAP_TABLES[CLIENT_APPLICATION_FACILITY_RESOURCE]?.selectFields).toContain('application { status }');
  });

  it('should leave places out of service out of the facility and access point pickers', () => {
    const candidates = (field: { readonly opts: { readonly candidates?: unknown } }) => field.opts.candidates;
    expect(candidates(TARGET_FORM_FIELDS.facility.facility_id)).toEqual([{ field: 'status', op: 'ne', value: 'inactive' }]);
    expect(candidates(TARGET_FORM_FIELDS.access_point.access_point_id)).toEqual([{ field: 'status', op: 'ne', value: 'inactive' }]);
  });
});
