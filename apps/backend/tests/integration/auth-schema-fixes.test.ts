import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addEmbedding, asAdminWithSession, axis, createIdentity, vectorLiteral } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { authWorld, backendActor, createApp, insertAttempt, insertSession, storeKey } from './support/authService.js';
import { callFn } from './support/operations.js';
import { runSql } from './support/sql.js';

const MATCH = `
  query Match($embedding: String!) {
    match_face(args: { p_embedding: $embedding, p_limit: 10 }) { identity_id }
  }
`;

describe('synthetic identities stay out of production matching', () => {
  it('should never return a synthetic template from match_face (recognition and enrollment paths)', async () => {
    const { orgA, user } = await createTwoOrgs();
    const real = await createIdentity(user.id, orgA.id);
    const synthetic = await createIdentity(user.id, orgA.id, { is_synthetic: true });
    await addEmbedding(orgA.id, real.id, axis(0), 0.9);
    await addEmbedding(orgA.id, synthetic.id, axis(1), 0.9);
    // Recognition runs as admin with the organization session; enrollment duplicate checks as the caller's org.
    for (const client of [asAdminWithSession(orgA.id), asOrgAdmin(user.id, orgA.id)]) {
      const onSynthetic = await client.request<{ match_face: { identity_id: string }[] }>(MATCH, { embedding: vectorLiteral(axis(1)) });
      expect(onSynthetic.match_face).toEqual([]);
      const onReal = await client.request<{ match_face: { identity_id: string }[] }>(MATCH, { embedding: vectorLiteral(axis(0)) });
      expect(onReal.match_face.map((m) => m.identity_id)).toEqual([real.id]);
    }
  });

  it('should keep is_synthetic immutable after insert', async () => {
    const { orgA, user } = await createTwoOrgs();
    const real = await createIdentity(user.id, orgA.id);
    const synthetic = await createIdentity(user.id, orgA.id, { is_synthetic: true });
    await expect(runSql(`update itap.identities set is_synthetic = true where id = '${real.id}'`)).rejects.toThrow(
      /identity_synthetic_immutable/,
    );
    await expect(runSql(`update itap.identities set is_synthetic = false where id = '${synthetic.id}'`)).rejects.toThrow(
      /identity_synthetic_immutable/,
    );
  });
});

describe('manual review only for partial matches', () => {
  it('should allow review_status pending only on partial matches and require a matched identity to review', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    const session = await insertSession(w.orgA.id, app.id);
    await expect(
      insertAttempt(w.orgA.id, app.id, session, { outcome: 'failure', failure_reason: 'below_threshold' }),
    ).rejects.toThrow(/authentication_attempts_review_status/);
    const unmatched = await insertAttempt(w.orgA.id, app.id, session);
    const e = await expectError(
      callFn(w.a, 'review_authentication_attempt', { p_attempt: unmatched, p_approve: true }, 'id'),
    );
    expect(e.message).toContain('auth_attempt_no_match');
  });
});

describe('client key limit under concurrency', () => {
  it('should let exactly one of two simultaneous stores pass when one key is active', async () => {
    const w = await authWorld();
    const actor = backendActor(w.user.id, w.orgA.id);
    const app = await createApp(w.a);
    await storeKey(actor, app.id);
    const results = await Promise.allSettled([storeKey(actor, app.id), storeKey(backendActor(w.user.id, w.orgA.id), app.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0].reason as Error).message)).toContain('client_key_limit');
  });
});

describe('authentication session transitions', () => {
  const setStatus = (id: string, status: string): Promise<void> =>
    runSql(
      `update itap.authentication_sessions set status = '${status}',
         closed_at = case when '${status}' in ('open', 'review') then null else now() end where id = '${id}'`,
    );

  it('should make succeeded/failed/expired terminal and let review end only in succeeded or failed', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    for (const terminal of ['succeeded', 'failed', 'expired']) {
      const s = await insertSession(w.orgA.id, app.id);
      await setStatus(s, terminal);
      for (const next of ['open', 'review', 'succeeded', 'failed', 'expired'].filter((x) => x !== terminal)) {
        await expect(setStatus(s, next)).rejects.toThrow(/auth_session_transition/);
      }
    }
    const r = await insertSession(w.orgA.id, app.id);
    await setStatus(r, 'review');
    for (const next of ['open', 'expired']) await expect(setStatus(r, next)).rejects.toThrow(/auth_session_transition/);
    await setStatus(r, 'succeeded');
    const f = await insertSession(w.orgA.id, app.id, { status: 'review' });
    await setStatus(f, 'failed');
    // Non-status updates of a closed session (e.g. FK SET NULL) still work.
    await runSql(`update itap.authentication_sessions set device_ref = null where id = '${f}'`);
  });
});
