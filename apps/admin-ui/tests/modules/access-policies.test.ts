import { type DataError, type Rule, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import {
  ACCESS_POLICY_RESOURCE,
  ACCESS_POLICY_SUBJECT_RESOURCE,
  ACCESS_POLICY_TARGET_RESOURCE,
  ACCESS_POLICY_VERSION_RESOURCE,
} from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { analyticsBounds, analyticsOf, analyticsRow } from '../../src/modules/access/policy-analytics-query';
import { ACCESS_BINDING } from '../../src/modules/access/policy-ops';
import { VERSION_CHECKS, submittedBySignedIn } from '../../src/modules/access/policy-version-rules';
import { simulationBounds } from '../../src/modules/access/simulation-query';
import { subjectText, targetText, validityText } from '../../src/modules/access/version-content-format';

/**
 * Access policies without the UI: "Draft a change" opens the open version, submit / approve /
 * reject are offered by status, the submitter is not offered "Approve" (four-eyes, Review Focus
 * 1) and a forced call reads the database's refusal, a pending or historical version is frozen,
 * rolling back copies a superseded version into a new draft, archiving, and the pure helpers of
 * the review, the simulation and the analytics.
 */

const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const ADMIN = { id: ME, roles: ['org_admin'] };
const POLICY = '99999999-9999-4999-8999-000000000001';
const VERSION = '99999999-9999-4999-8999-000000000002';

const policy = (extra: Record<string, unknown> = {}) => ({
  id: POLICY,
  code: 'POL-00007',
  name: 'Lab access',
  is_archived: false,
  current_version_id: null,
  ...extra,
});
const version = (status: string, extra: Record<string, unknown> = {}) => ({
  id: VERSION,
  policy_id: POLICY,
  version: 2,
  status,
  effect: 'allow',
  priority: 100,
  submitted_by: status === 'pending_approval' ? OTHER : null,
  ...extra,
});
const changed = (status: string) => answer({ id: VERSION, policy_id: POLICY, version: 2, status });

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

beforeAll(async () => {
  await app.ready;
});

describe('draft a change and archive', () => {
  it('should ask for the policy’s open version and open it', async () => {
    const run = await flow(ACCESS_POLICY_RESOURCE, 'draft_change', policy(), {
      'itap:create-access-policy-draft': [changed('draft')],
    }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { policyId: POLICY, fromVersionId: null } });
    expect(run.state.effects?.open).toMatchObject({ resource: ACCESS_POLICY_VERSION_RESOURCE, id: VERSION });
  });

  it('should archive after the confirmation, and offer neither on an archived policy', async () => {
    const run = await flow(ACCESS_POLICY_RESOURCE, 'archive', policy({ current_version_id: VERSION }), {
      'itap:archive-access-policy': [answer({ id: POLICY, code: 'POL-00007', is_archived: true })],
    }).open();
    await run.submit();
    await run.accept();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { policyId: POLICY } });
    for (const action of ['draft_change', 'archive']) {
      (await flow(ACCESS_POLICY_RESOURCE, action, policy({ is_archived: true })).open()).assertUnavailable();
    }
  });

  it('should delete a policy only while no version is in force', () => {
    expect(denied(ACCESS_POLICY_RESOURCE, 'delete', policy())).toBe(false);
    expect(denied(ACCESS_POLICY_RESOURCE, 'delete', policy({ current_version_id: VERSION }))).toBe(true);
  });
});

describe('submit, approve, reject', () => {
  it('should submit a draft from the dialog that shows it', async () => {
    const run = await flow(ACCESS_POLICY_VERSION_RESOURCE, 'submit', version('draft'), {
      'itap:submit-access-policy-version': [changed('pending_approval')],
    }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { versionId: VERSION } });
    for (const status of ['pending_approval', 'published', 'superseded']) {
      (await flow(ACCESS_POLICY_VERSION_RESOURCE, 'submit', version(status)).open()).assertUnavailable();
    }
  });

  it('should let another member approve a pending version from the dialog that shows it', async () => {
    const run = await flow(ACCESS_POLICY_VERSION_RESOURCE, 'approve', version('pending_approval'), {
      'itap:approve-access-policy-version': [changed('published')],
    }).open();
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { versionId: VERSION } });
    for (const status of ['draft', 'published', 'superseded']) {
      (await flow(ACCESS_POLICY_VERSION_RESOURCE, 'approve', version(status)).open()).assertUnavailable();
    }
  });

  it('should not offer Approve to the member who submitted the version (Review Focus 1)', async () => {
    const mine = version('pending_approval', { submitted_by: ME.toUpperCase() });
    (await flow(ACCESS_POLICY_VERSION_RESOURCE, 'approve', mine).open()).assertDisabled(/another member must approve it/);
    expect(submittedBySignedIn({ record: mine, user: ADMIN } as never)).toBe(true);
    expect(submittedBySignedIn({ record: version('pending_approval'), user: ADMIN } as never)).toBe(false);
  });

  it('should reject with a reason, the submitter included', async () => {
    const mine = version('pending_approval', { submitted_by: ME });
    const run = await flow(ACCESS_POLICY_VERSION_RESOURCE, 'reject', mine, {
      'itap:reject-access-policy-version': [changed('draft')],
    }).open();
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ reason: 'Wrong door' });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { versionId: VERSION, reason: 'Wrong door' } });
  });
});

describe('frozen versions and rollback', () => {
  it('should edit and discard a draft only, saying why not otherwise', () => {
    for (const action of ['edit', 'delete']) {
      expect(denied(ACCESS_POLICY_VERSION_RESOURCE, action, version('draft')), action).toBe(false);
      for (const status of ['pending_approval', 'published', 'superseded']) {
        expect(denied(ACCESS_POLICY_VERSION_RESOURCE, action, version(status)), `${action} ${status}`).toBe(true);
      }
    }
  });

  it('should copy a superseded version into a new draft and open it', async () => {
    const run = await flow(ACCESS_POLICY_VERSION_RESOURCE, 'rollback', version('superseded'), {
      'itap:create-access-policy-draft': [answer({ id: OTHER, policy_id: POLICY, version: 4, status: 'draft' })],
    }).open();
    await run.submit();
    await run.accept();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { policyId: POLICY, fromVersionId: VERSION } });
    expect(run.state.effects?.open).toMatchObject({ resource: ACCESS_POLICY_VERSION_RESOURCE, id: OTHER });
    for (const status of ['draft', 'pending_approval', 'published']) {
      (await flow(ACCESS_POLICY_VERSION_RESOURCE, 'rollback', version(status)).open()).assertUnavailable();
    }
  });

  it('should never create a version, subject or target except through the lifecycle and a draft', () => {
    const operations = (name: string) => (app.registry.get(name) as { operations?: Record<string, boolean> }).operations;
    expect(operations(ACCESS_POLICY_VERSION_RESOURCE)?.create).toBe(false);
    expect(operations(ACCESS_POLICY_SUBJECT_RESOURCE)).toMatchObject({ create: false, edit: false, delete: false });
    expect(operations(ACCESS_POLICY_TARGET_RESOURCE)).toMatchObject({ create: false, edit: false, delete: false });
  });

  it('should refuse a validity that ends before it starts', () => {
    const check = VERSION_CHECKS[0]?.when as (di: { values: Record<string, unknown> }) => boolean;
    expect(check({ values: { valid_from: '2026-11-02T00:00:00Z', valid_until: '2026-11-01T00:00:00Z' } })).toBe(true);
    expect(check({ values: { valid_from: '2026-11-01T00:00:00Z', valid_until: '2026-11-02T00:00:00Z' } })).toBe(false);
    expect(check({ values: { valid_from: null, valid_until: '2026-11-02T00:00:00Z' } })).toBe(false);
  });
});

describe('refusals through the provider (Review Focus 1)', () => {
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

  it('should read a forced approval by the submitter as a definite refusal saying so', async () => {
    const provider = providerFailing('Check constraint violation. four_eyes_required');
    await expect(provider.mutations?.custom?.(call('approveAccessPolicyVersion'), {} as never)).rejects.toMatchObject({
      kind: 'validation',
      code: 'four_eyes_required',
      details: { issues: [{ message: { default: expect.stringMatching(/another member must approve it/) } }] },
    });
  });

  it('should explain a rollback refused for an open version and an incomplete submission', async () => {
    await expect(
      providerFailing('Check constraint violation. version_open_exists').mutations?.custom?.(call('createAccessPolicyDraft'), {} as never),
    ).rejects.toMatchObject({
      code: 'version_open_exists',
      details: { issues: [{ message: { default: expect.stringMatching(/already has an open version/) } }] },
    });
    await expect(
      providerFailing('Check constraint violation. access_policy_version_incomplete').mutations?.custom?.(
        call('submitAccessPolicyVersion'),
        {} as never,
      ),
    ).rejects.toMatchObject({ code: 'access_policy_version_incomplete' });
  });
});

describe('review, simulation and analytics helpers', () => {
  const t = (key: string, options?: { readonly params?: Record<string, unknown> }) => `${key}:${JSON.stringify(options?.params ?? {})}`;
  const label = (value: string) => value.toUpperCase();

  it('should word each kind of subject and target', () => {
    const none = { profile: null, segment: null, profile_type: null, access_level: null };
    expect(subjectText({ ...none, profile_type: 'employee' }, t, label, label)).toBe('subjectType:{"name":"EMPLOYEE"}');
    expect(subjectText({ ...none, access_level: 'elevated' }, t, label, label)).toBe('subjectLevel:{"name":"ELEVATED"}');
    expect(subjectText({ ...none, segment: { name: 'Night shift' } }, t, label, label)).toBe('subjectSegment:{"name":"Night shift"}');
    expect(subjectText({ ...none, profile: { code: 'P-1', first_name: 'Ada', last_name: 'Byron' } }, t, label, label)).toBe(
      'subjectProfile:{"name":"Ada Byron"}',
    );
    expect(targetText({ facility: null, area: { name: 'Lab' }, access_point: null }, t)).toBe('targetArea:{"name":"Lab"}');
    expect(validityText({ valid_from: null, valid_until: null }, t)).toBe('validAlways:{}');
  });

  it('should bound the periods to now', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    expect(simulationBounds('7d', now)).toEqual({ from: '2026-10-16T12:00:00.000Z', to: '2026-10-23T12:00:00.000Z' });
    expect(analyticsBounds('90d', now).from).toBe('2026-07-25T12:00:00.000Z');
  });

  it('should count unused versions and conflicting overlaps from one analytics row', () => {
    const row = analyticsRow.parse({
      decisions: 10,
      granted: 7,
      denied: 3,
      versions: [],
      unused_versions: [{ version_id: VERSION, policy_id: POLICY, policy_code: 'POL-00007', policy_name: 'Lab', effect: 'allow' }],
      denial_reasons: [{ reason: 'no_rule', count: 3 }],
      top_denied: [],
      overlap_hints: [
        { version_a: 'a', policy_a: 'p', effect_a: 'allow', priority_a: 100, version_b: 'b', policy_b: 'q', effect_b: 'deny', priority_b: 100, kind: 'conflicting' },
        { version_a: 'a', policy_a: 'p', effect_a: 'allow', priority_a: 100, version_b: 'c', policy_b: 'r', effect_b: 'allow', priority_b: 90, kind: 'same_effect' },
      ],
      grants: { total: 4, used: 1, revoked: 1, expired: 1, unused: 1 },
      complexity: { enforced_policies: 3, subjects: 5, targets: 4, schedules: 1, max_risk: 0, avg_subjects: 1.67, avg_targets: 1.33 },
    });
    expect(analyticsOf(row)).toMatchObject({ decisions: 10, enforced: 3, unused: 1, conflicts: 1, grants: 4 });
  });
});
