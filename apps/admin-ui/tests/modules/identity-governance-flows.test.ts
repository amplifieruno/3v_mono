import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, reject, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import {
  IDENTITY_DUPLICATE_RESOURCE,
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_RESOURCE,
  VERIFICATION_REQUEST_RESOURCE,
} from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { PEOPLE_BINDING } from '../../src/modules/people/profile-activity';

/**
 * Identity governance without the UI: what merging, rolling back, splitting, deciding a
 * verification and adding a relationship send, when each is offered, that a merged identity
 * disables them with the reason, and that the database's refusals reach the form.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const KEPT = '66666666-6666-4666-8666-000000000001';
const OTHER = '66666666-6666-4666-8666-000000000002';
const THIRD = '66666666-6666-4666-8666-000000000003';
const MERGE = '77777777-7777-4777-8777-000000000001';
const PAIR = '44444444-4444-4444-8444-000000000001';
const REQUEST = '55555555-5555-4555-8555-000000000001';
const PHOTO = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const FILE = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const TEMPLATE = 'dddddddd-dddd-4ddd-8ddd-000000000001';

const kept = { id: KEPT, code: 'IDENTITY-00001', status: 'unverified', is_synthetic: false, matching_enabled: true, profile_id: null };
const merged = { ...kept, status: 'merged' };

const target = (resource: string, action: string) => ({ resource, action }) as const;

const identityFlow = (action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, target(IDENTITY_RESOURCE, action), {
    user: ADMIN,
    record,
    rows: { [IDENTITY_RESOURCE]: [record] },
    mutations: mutations as never,
  });

const mergeRow = { id: MERGE, target_identity_id: KEPT, status: 'completed' };

beforeAll(async () => {
  await app.ready;
});

describe('merge into this identity', () => {
  it('should send this identity as the target and the chosen ones as sources, after the review', async () => {
    const flow = await identityFlow('merge_into', kept, { 'itap:merge-identities': [answer(mergeRow)] }).open();
    flow.fill({ source_ids: [OTHER, THIRD], reason: 'Same person, two cameras' });
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { targetId: KEPT, sourceIds: [OTHER, THIRD], reason: 'Same person, two cameras' },
    });
  });

  it('should not send without an identity to merge', async () => {
    const flow = await identityFlow('merge_into', kept).open();
    await flow.submit();
    flow.assertNotSubmitted();
  });

  it('should disable merging, splitting and adding photos on a merged identity, with the reason', async () => {
    for (const action of ['merge_into', 'split', 'add_photos']) {
      (await identityFlow(action, merged).open()).assertDisabled(/merged into another one/);
    }
  });
});

describe('split', () => {
  it('should send the chosen photos with their face templates and open the new identity', async () => {
    const flow = await identityFlow('split', kept, {
      'itap:split-identity': [answer({ id: THIRD, code: 'IDENTITY-00003' })],
    }).open();
    flow.fill({ parts: { identityId: KEPT, photos: [{ id: PHOTO, fileId: FILE }], embeddingIds: [TEMPLATE] } });
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { identityId: KEPT, photoIds: [PHOTO], embeddingIds: [TEMPLATE] },
    });
    expect(flow.state.effects?.open).toMatchObject({ resource: IDENTITY_RESOURCE, id: THIRD });
  });

  it('should not send without a chosen photo (the value starts as the identity’s id)', async () => {
    const flow = await identityFlow('split', kept).open();
    await flow.submit();
    flow.assertNotSubmitted();
    expect(JSON.stringify(flow.state)).toContain('Choose at least one photo to split off.');
  });
});

describe('duplicate pair', () => {
  const pair = { id: PAIR, identity_a_id: KEPT, identity_b_id: OTHER, similarity: 0.91, status: 'open' };
  const pairFlow = (action: string, record: Record<string, unknown>) =>
    runFlow(app, target(IDENTITY_DUPLICATE_RESOURCE, action), {
      user: ADMIN,
      record,
      rows: { [IDENTITY_DUPLICATE_RESOURCE]: [record] },
      mutations: { 'itap:merge-identities': [answer({ ...mergeRow, target_identity_id: OTHER })] },
    });

  it('should merge the first into the second when the second is kept, then open the kept identity', async () => {
    const flow = await pairFlow('merge_identities', pair).open();
    flow.fill({ keep: 'second' });
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { targetId: OTHER, sourceIds: [KEPT] } });
    expect(flow.state.effects?.open).toMatchObject({ resource: IDENTITY_RESOURCE, id: OTHER });
  });

  it('should offer merging and dismissing an open pair only, and reopening a dismissed one', async () => {
    for (const status of ['merged', 'dismissed']) {
      (await pairFlow('merge_identities', { ...pair, status }).open()).assertUnavailable();
      (await pairFlow('dismiss', { ...pair, status }).open()).assertUnavailable();
    }
    (await pairFlow('reopen', pair).open()).assertUnavailable();
    const reopen = await pairFlow('reopen', { ...pair, status: 'dismissed' }).open();
    expect(reopen.state.control).toBe('ready');
  });
});

describe('roll back', () => {
  const merge = { id: MERGE, target_identity_id: KEPT, status: 'completed' };
  const rollbackFlow = (record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
    runFlow(app, target(IDENTITY_MERGE_RESOURCE, 'rollback'), {
      user: ADMIN,
      record,
      rows: { [IDENTITY_MERGE_RESOURCE]: [record] },
      mutations: mutations as never,
    });

  it('should roll back a completed merge after the review', async () => {
    const flow = await rollbackFlow(merge, {
      'itap:rollback-merge': [answer({ ...merge, status: 'rolled_back' })],
    }).open();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { mergeId: MERGE } });
  });

  it('should not offer a merge that was rolled back', async () => {
    (await rollbackFlow({ ...merge, status: 'rolled_back' }).open()).assertUnavailable();
  });

  it('should show why the database refused it, not "may have been applied"', async () => {
    const refused: DataError = {
      kind: 'validation',
      code: 'merge_target_merged',
      message: '',
      details: { issues: [{ code: 'merge_target_merged', message: 'Roll back that later merge first.', path: [] }] },
    };
    const flow = await rollbackFlow(merge, { 'itap:rollback-merge': [reject(refused)] }).open();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('rejected');
    expect(JSON.stringify(flow.state)).toContain('Roll back that later merge first.');
  });
});

describe('verification requests', () => {
  const request = { id: REQUEST, identity_id: KEPT, status: 'pending' };
  const decide = (action: string, record: Record<string, unknown>) =>
    runFlow(app, target(VERIFICATION_REQUEST_RESOURCE, action), {
      user: ADMIN,
      record,
      rows: { [VERIFICATION_REQUEST_RESOURCE]: [record] },
      mutations: {
        'itap:approve-verification': [answer({ id: REQUEST, status: 'approved' })],
        'itap:reject-verification': [answer({ id: REQUEST, status: 'rejected' })],
      },
    });

  it('should approve with an optional reason', async () => {
    const flow = await decide('approve', request).open();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { requestId: REQUEST, reason: null } });
  });

  it('should reject only with a reason', async () => {
    const flow = await decide('reject', request).open();
    await flow.submit();
    flow.assertNotSubmitted();
    flow.fill({ reason: 'ID card does not match' });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { requestId: REQUEST, reason: 'ID card does not match' } });
  });

  it('should offer decisions on a pending request only', async () => {
    for (const status of ['approved', 'rejected', 'cancelled']) {
      (await decide('approve', { ...request, status }).open()).assertUnavailable();
      (await decide('reject', { ...request, status }).open()).assertUnavailable();
    }
  });
});

describe('add relationship', () => {
  it('should send this identity, the other one and what the relationship says', async () => {
    const flow = await identityFlow('add_relationship', kept, {
      'itap:add-identity-relationship': [answer({ id: 'r1' })],
    }).open();
    flow.fill({ other_id: OTHER, relation: 'companion', confidence: 0.8, note: 'Arrive together' });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { identityId: KEPT, otherId: OTHER, relation: 'companion', confidence: 0.8, note: 'Arrive together' },
    });
  });
});

describe('SQL function refusals through the provider', () => {
  const providerFailing = (message: string, code = 'permission-error') =>
    withActionRefusals(
      defineDataProvider({
        mutations: {
          custom: defineMutationHandler(async () =>
            Promise.reject({ kind: 'sent', code, message, details: [{ message, extensions: { code } }] } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    );
  const call = (operation: string) => ({ kind: 'custom', resource: PEOPLE_BINDING, operation, input: {} }) as never;

  it('should read a merge refusal as a definite one with its sentence', async () => {
    const provider = providerFailing('Check constraint violation. merge_profile_conflict');
    await expect(provider.mutations?.custom?.(call('mergeIdentities'), {} as never)).rejects.toMatchObject({
      kind: 'validation',
      code: 'merge_profile_conflict',
      details: { issues: [{ message: { default: expect.stringMatching(/different profiles/) }, path: [] }] },
    });
  });

  it('should count the rows a rollback could not restore', async () => {
    const provider = providerFailing('Check constraint violation. merge_rows_moved:3');
    await expect(provider.mutations?.custom?.(call('rollbackMerge'), {} as never)).rejects.toMatchObject({
      code: 'merge_rows_moved',
      details: { issues: [{ message: { default: expect.stringMatching(/^3 of the photos/) } }] },
    });
  });

  it('should name a relationship that already exists', async () => {
    const provider = providerFailing(
      'Uniqueness violation. duplicate key value violates unique constraint "identity_relationships_pair_key"',
      'constraint-violation',
    );
    await expect(provider.mutations?.custom?.(call('addIdentityRelationship'), {} as never)).rejects.toMatchObject({
      code: 'identity_relationships_pair_key',
      details: { issues: [{ message: { default: expect.stringMatching(/already related/) } }] },
    });
  });
});
