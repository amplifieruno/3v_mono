import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import {
  CONSENT_RECORD_RESOURCE,
  PROFILE_DUPLICATE_RESOURCE,
  PROFILE_RESOURCE,
} from '../../src/data/resource-names';
import { consentOnErasedProfile } from '../../src/modules/people/consent-record';
import { mergeDirection } from '../../src/modules/people/merge-profiles';
import { compareRows } from '../../src/modules/people/profile-compare-rows';

/**
 * The flows of profile documents, consent, restriction and duplicates without the UI: what each
 * sends, when each is offered, and that an erased profile disables them with the reason (Review
 * Focus 3) while a restricted or erased pair cannot be merged.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const ANNA = '33333333-3333-4333-8333-000000000001';
const IVAN = '33333333-3333-4333-8333-000000000002';
const PAIR = '44444444-4444-4444-8444-000000000001';

const anna = {
  id: ANNA,
  first_name: 'Anna',
  last_name: 'Petrova',
  profile_type: 'employee',
  processing_restricted: false,
  erased_at: null,
};
const ivan = { ...anna, id: IVAN, first_name: 'Ivan', last_name: 'Sokolov' };
const erasedAnna = { ...anna, processing_restricted: true, erased_at: '2026-10-02T09:00:00Z' };
const restrictedAnna = { ...anna, processing_restricted: true };

const target = (resource: string, action: string) => ({ resource, action }) as const;

const profileFlow = (action: string, record: Record<string, unknown>) =>
  runFlow(app, target(PROFILE_RESOURCE, action), {
    user: ADMIN,
    record,
    rows: { [PROFILE_RESOURCE]: [record] },
    mutations: {
      'itap:upload-profile-document': [answer({ document_id: 'd1', file_id: 'f1' })],
      'itap:set-processing-restriction': [answer({ id: ANNA, processing_restricted: true })],
    },
  });

beforeAll(async () => {
  await app.ready;
});

describe('upload document', () => {
  it('should send the picked file inside the action’s input, as base64', async () => {
    const flow = await profileFlow('upload_document', anna).open();
    flow.fill({
      kind: 'id_card',
      title: '  Passport 2031 ',
      file: { file_name: 'passport.pdf', mime_type: 'application/pdf', size: 4, content_base64: 'JVBERg==' },
    });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: {
        profileId: ANNA,
        kind: 'id_card',
        title: 'Passport 2031',
        fileName: 'passport.pdf',
        mimeType: 'application/pdf',
        contentBase64: 'JVBERg==',
      },
    });
  });

  it('should not send without a file', async () => {
    const flow = await profileFlow('upload_document', anna).open();
    flow.fill({ kind: 'other', title: 'Contract' });
    await flow.submit();
    flow.assertNotSubmitted();
  });
});

describe('processing restriction', () => {
  it('should restrict with the reason given', async () => {
    const flow = await profileFlow('restrict_processing', anna).open();
    flow.fill({ reason: 'Accuracy contested' });
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { profileId: ANNA, restricted: true, reason: 'Accuracy contested' },
    });
  });

  it('should not send a restriction without a reason', async () => {
    const flow = await profileFlow('restrict_processing', anna).open();
    await flow.submit();
    flow.assertNotSubmitted();
  });

  it('should refuse a reason of spaces only on the field', async () => {
    const flow = (await profileFlow('restrict_processing', anna).open()).fill({ reason: '   ' });
    await flow.submit();
    flow.assertNotSubmitted();
    expect(JSON.stringify(flow.state)).toContain('not only spaces');
  });

  it('should offer Restrict on an unrestricted profile and Lift on a restricted one', async () => {
    (await profileFlow('lift_restriction', anna).open()).assertUnavailable();
    (await profileFlow('restrict_processing', restrictedAnna).open()).assertUnavailable();
    const lift = await profileFlow('lift_restriction', restrictedAnna).open();
    lift.fill({ reason: 'Data corrected' });
    await lift.submit();
    await lift.accept();
    expect(lift.submitted[0]?.call).toMatchObject({ input: { restricted: false, reason: 'Data corrected' } });
  });

  it('should disable every changing flow of an erased profile, with the reason', async () => {
    for (const action of ['upload_document', 'lift_restriction']) {
      (await profileFlow(action, erasedAnna).open()).assertDisabled(/tombstone/);
    }
  });
});

describe('consent withdrawal', () => {
  const consent = {
    id: 'c1',
    profile_id: ANNA,
    purpose: 'tracking',
    status: 'granted',
    method: 'paper',
    granted_at: '2026-01-01T00:00:00Z',
    withdrawn_at: null,
  };
  const withdraw = (record: Record<string, unknown>) =>
    runFlow(app, target(CONSENT_RECORD_RESOURCE, 'withdraw'), {
      user: ADMIN,
      record,
      rows: { [CONSENT_RECORD_RESOURCE]: [record] },
    });

  it('should mark a granted consent withdrawn', async () => {
    const flow = await withdraw(consent).open();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { status: 'withdrawn' } });
  });

  it('should say what withdrawing biometric consent stops before sending it', async () => {
    const flow = await withdraw({ ...consent, purpose: 'biometric_processing' }).open();
    await flow.submit();
    expect(JSON.stringify(flow.state)).toContain('Face matching stops at once');
    flow.assertNotSubmitted();
  });

  it('should not offer Withdraw on a withdrawn consent', async () => {
    (await withdraw({ ...consent, status: 'withdrawn', withdrawn_at: '2026-02-01T00:00:00Z' }).open()).assertUnavailable();
  });
});

describe('duplicate pairs', () => {
  const pair = { id: PAIR, profile_a_id: ANNA, profile_b_id: IVAN, status: 'open', similarity: 0.9, reasons: ['email'] };
  const pairFlow = (action: string, record: Record<string, unknown>, profiles: Record<string, unknown>[]) =>
    runFlow(app, target(PROFILE_DUPLICATE_RESOURCE, action), {
      user: ADMIN,
      record,
      rows: { [PROFILE_DUPLICATE_RESOURCE]: [record], [PROFILE_RESOURCE]: profiles },
      mutations: { 'itap:merge-profiles': [answer({ id: IVAN })] },
    });

  it('should keep the chosen profile as the target of the merge', async () => {
    const flow = await pairFlow('merge_profiles', pair, [anna, ivan]).open();
    flow.fill({ keep: 'second' });
    await flow.submit();
    await flow.submit();
    await flow.accept();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { targetId: IVAN, sourceId: ANNA } });
  });

  it('should refuse to merge a pair with an erased or a restricted profile before sending', async () => {
    for (const [first, said] of [
      [erasedAnna, 'was erased'],
      [restrictedAnna, 'is restricted'],
    ] as const) {
      const flow = (await pairFlow('merge_profiles', pair, [first, ivan]).open()).fill({ keep: 'first' });
      await flow.submit();
      expect(JSON.stringify(flow.state)).toContain(said);
      flow.assertNotSubmitted();
    }
  });

  it('should dismiss an open pair and reopen a dismissed one', async () => {
    const dismiss = await pairFlow('dismiss', pair, [anna, ivan]).open();
    await dismiss.submit();
    await dismiss.accept();
    expect(dismiss.submitted[0]?.call).toMatchObject({ input: { status: 'dismissed' } });
    (await pairFlow('merge_profiles', { ...pair, status: 'dismissed' }, [anna, ivan]).open()).assertUnavailable();
    const reopen = await pairFlow('reopen', { ...pair, status: 'dismissed' }, [anna, ivan]).open();
    await reopen.submit();
    expect(reopen.submitted[0]?.call).toMatchObject({ input: { status: 'open' } });
  });
});

describe('helpers', () => {
  it('should refuse a consent for an erased profile and allow one for a live profile', async () => {
    const when = consentOnErasedProfile.when as (di: unknown) => Promise<boolean>;
    const di = (row: Record<string, unknown>) => ({
      values: { profile_id: row.id },
      data: { one: async () => ({ data: row }) },
    });
    expect(await when(di(erasedAnna))).toBe(true);
    expect(await when(di(anna))).toBe(false);
  });

  it('should merge into the kept side', () => {
    const pair = { profile_a_id: ANNA, profile_b_id: IVAN };
    expect(mergeDirection(pair, 'first')).toEqual({ targetId: ANNA, sourceId: IVAN });
    expect(mergeDirection(pair, 'second')).toEqual({ targetId: IVAN, sourceId: ANNA });
  });

  it('should mark differing identifying fields, never the counts', () => {
    const base = {
      id: ANNA,
      code: 'PROFILE-00001',
      profile_type: 'employee',
      first_name: 'Anna',
      last_name: 'Petrova',
      email: 'anna@aurora.test',
      phone: null,
      employee_id: null,
      department: null,
      job_title: null,
      start_date: null,
      end_date: null,
      status: 'active',
      company: null,
      identities: 1,
      documents: 0,
      consents: 0,
      processing_restricted: false,
      erased_at: null,
      created_at: '2026-01-01T00:00:00Z',
    };
    const rows = compareRows(base, { ...base, id: IVAN, email: 'ANNA@aurora.test ', phone: '+7 900', identities: 3 });
    const differs = rows.filter((row) => row.differs).map((row) => row.field);
    expect(differs).toEqual(['phone']);
  });
});
