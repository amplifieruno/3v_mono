import { type DataError, type Rule, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import {
  ACCESS_DECISION_RESOURCE,
  ACCESS_GRANT_RESOURCE,
  ACCESS_POINT_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
  EMERGENCY_OVERRIDE_RESOURCE,
} from '../../src/data/resource-names';
import { grantUseState } from '../../src/fields/grant-use-state';
import { ACTION_REFUSALS } from '../../src/modules';
import { GRANT_CHECKS, grantExpired } from '../../src/modules/access/grant-flows';
import { ACCESS_BINDING } from '../../src/modules/access/policy-ops';
import { policyArchived } from '../../src/modules/access/policy-version-rules';

/**
 * Access grants and decisions without the UI: a grant is never edited or deleted, only revoked
 * with a reason (not offered once revoked or used up, disabled with the reason once expired); a
 * single-use grant reads Unused or Used (Review Focus 4); the create form restates the database's
 * checks; "Test access" sends the person or face and opens the decision's trace; decisions are
 * read only; a version of an archived policy is not edited, submitted or rolled back; refusals.
 */

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', roles: ['org_admin'] };
const GRANT = '99999999-9999-4999-8999-000000000001';
const PERSON = '99999999-9999-4999-8999-000000000002';
const DOOR = '99999999-9999-4999-8999-000000000003';
const DECISION = '99999999-9999-4999-8999-000000000004';
const FUTURE = '2999-01-01T00:00:00Z';

const grant = (extra: Record<string, unknown> = {}) => ({
  id: GRANT,
  profile_id: PERSON,
  area_id: null,
  access_point_id: DOOR,
  valid_from: '2026-10-01T00:00:00Z',
  valid_until: FUTURE,
  single_use: false,
  used_at: null,
  reason: 'Repair',
  revoked_at: null,
  ...extra,
});

const flow = (resource: string, action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource, action }, { user: ADMIN, record, rows: { [resource]: [record] }, mutations: mutations as never });

const rulesOf = (name: string) => (app.registry.get(name) as { rules?: Rule[] }).rules ?? [];
const denied = (name: string, action: string, record: Record<string, unknown>) =>
  rulesOf(name)
    .filter((r) => {
      const target = (r.target as { name?: string | readonly string[] }).name;
      return Array.isArray(target) ? target.includes(action) : target === action;
    })
    .some((r) => (r.when as (ctx: { record: unknown; user: unknown }) => boolean)({ record, user: ADMIN }));
const operations = (name: string) => (app.registry.get(name) as { operations?: Record<string, boolean> }).operations;

beforeAll(async () => {
  await app.ready;
});

describe('grants are revoked, never edited (Review Focus 4)', () => {
  it('should revoke with a reason, asking for one first', async () => {
    const run = await flow(ACCESS_GRANT_RESOURCE, 'revoke', grant(), {
      'itap:revoke-access-grant': [answer({ id: GRANT, revoked_at: '2026-10-23T10:00:00Z' })],
    }).open();
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ reason: '   ' });
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ reason: 'Visit cancelled' });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { grantId: GRANT, reason: 'Visit cancelled' } });
  });

  it('should not offer Revoke on a revoked or used-up grant, and say why on an expired one', async () => {
    (await flow(ACCESS_GRANT_RESOURCE, 'revoke', grant({ revoked_at: '2026-10-22T00:00:00Z' })).open()).assertUnavailable();
    (await flow(ACCESS_GRANT_RESOURCE, 'revoke', grant({ single_use: true, used_at: '2026-10-22T00:00:00Z' })).open()).assertUnavailable();
    // A single-use grant not used yet can still be revoked.
    expect(denied(ACCESS_GRANT_RESOURCE, 'revoke', grant({ single_use: true }))).toBe(false);
    (await flow(ACCESS_GRANT_RESOURCE, 'revoke', grant({ valid_until: '2026-01-01T00:00:00Z' })).open()).assertDisabled(/has expired/);
    expect(grantExpired(grant({ valid_until: '2026-10-23T00:00:00Z' }), Date.parse('2026-10-23T00:00:01Z'))).toBe(true);
    expect(grantExpired(grant(), Date.parse('2026-10-23T00:00:01Z'))).toBe(false);
  });

  it('should offer no edit or delete on a grant, and only create', () => {
    expect(operations(ACCESS_GRANT_RESOURCE)).toMatchObject({ edit: false, delete: false });
    expect(operations(ACCESS_GRANT_RESOURCE)?.create).not.toBe(false);
  });

  it('should read a single-use grant as used or unused, a reusable one as reusable', () => {
    expect(grantUseState(null, { single_use: true })).toEqual({ kind: 'unused' });
    expect(grantUseState('2026-10-22T08:00:00Z', { single_use: true })).toEqual({ kind: 'used', at: Date.parse('2026-10-22T08:00:00Z') });
    expect(grantUseState(null, { single_use: false })).toEqual({ kind: 'reusable' });
    expect(grantUseState(null, undefined)).toEqual({ kind: 'reusable' });
  });

  it('should ask for exactly one of area and access point, and a window that ends after it starts', () => {
    const [oneTarget, window] = GRANT_CHECKS.map((c) => c.when as (di: { values: Record<string, unknown> }) => boolean);
    expect(oneTarget?.({ values: { area_id: null, access_point_id: null } })).toBe(true);
    expect(oneTarget?.({ values: { area_id: 'a', access_point_id: 'b' } })).toBe(true);
    expect(oneTarget?.({ values: { area_id: 'a', access_point_id: '' } })).toBe(false);
    expect(oneTarget?.({ values: { area_id: null, access_point_id: 'b' } })).toBe(false);
    expect(window?.({ values: { valid_from: '2026-11-02T00:00:00Z', valid_until: '2026-11-01T00:00:00Z' } })).toBe(true);
    expect(window?.({ values: { valid_from: '2026-11-01T00:00:00Z', valid_until: '2026-11-02T00:00:00Z' } })).toBe(false);
  });
});

describe('decisions and Test access', () => {
  it('should keep decisions and overrides read only', () => {
    expect(operations(ACCESS_DECISION_RESOURCE)).toMatchObject({ create: false, edit: false, delete: false });
    expect(operations(EMERGENCY_OVERRIDE_RESOURCE)).toMatchObject({ create: false, edit: false, delete: false });
  });

  it('should test a person at a door and open the decision’s trace', async () => {
    const point = { id: DOOR, name: 'Lab door', facility_id: 'f', status: 'active' };
    const run = await flow(ACCESS_POINT_RESOURCE, 'test_access', point, {
      'itap:check-access': [answer({ id: DECISION, result: 'granted', reason: 'grant' })],
    }).open();
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ profile_id: PERSON });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { accessPointId: DOOR, profileId: PERSON, identityId: null } });
    expect(run.state.effects?.open).toMatchObject({ props: { decisionId: DECISION, showDecisionLink: true } });
  });
});

describe('versions of an archived policy (review follow-up)', () => {
  const version = (archived: boolean, status = 'draft') => ({ id: 'v', policy_id: 'p', version: 3, status, policy: { is_archived: archived } });

  it('should not edit, submit or roll back a version of an archived policy, saying why', async () => {
    for (const action of ['edit', 'submit', 'rollback']) {
      expect(denied(ACCESS_POLICY_VERSION_RESOURCE, action, version(true)), action).toBe(true);
    }
    expect(denied(ACCESS_POLICY_VERSION_RESOURCE, 'submit', version(false))).toBe(false);
    expect(policyArchived({ record: { id: 'v', policy: null } } as never)).toBe(false);
    (await flow(ACCESS_POLICY_VERSION_RESOURCE, 'submit', version(true)).open()).assertDisabled(/The policy is archived/);
    (await flow(ACCESS_POLICY_VERSION_RESOURCE, 'rollback', version(true, 'superseded')).open()).assertDisabled(/The policy is archived/);
  });
});

describe('refusals through the provider', () => {
  const providerFailing = (message: string) =>
    withActionRefusals(
      defineDataProvider({
        mutations: {
          custom: defineMutationHandler(async () =>
            Promise.reject({
              kind: 'sent',
              code: 'constraint-violation',
              message,
              details: [{ message, extensions: { code: 'constraint-violation' } }],
            } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    );
  const call = (operation: string) => ({ kind: 'custom', resource: ACCESS_BINDING, operation, input: {} }) as never;

  it('should read a second revocation and a face of another person as definite refusals', async () => {
    await expect(
      providerFailing('Check constraint violation. access_grant_revoked').mutations?.custom?.(call('revokeAccessGrant'), {} as never),
    ).rejects.toMatchObject({ kind: 'validation', code: 'access_grant_revoked' });
    await expect(
      providerFailing('Check constraint violation. identity_profile_mismatch').mutations?.custom?.(call('checkAccess'), {} as never),
    ).rejects.toMatchObject({
      code: 'identity_profile_mismatch',
      details: { issues: [{ message: { default: expect.stringMatching(/No decision was recorded/) } }] },
    });
  });
});
