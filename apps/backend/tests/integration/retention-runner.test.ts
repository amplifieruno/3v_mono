import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { orgAdminToken } from './support/clients.js';
import { sqlHold } from './support/compliance.js';
import { uploadFile } from './support/fixtures.js';
import { cronPayload, postTrigger } from './support/sending.js';
import { runSql, runSqlRows } from './support/sql.js';
import { count, insertRow, q, queued, retentionWorld, sqlIdentity, sqlPolicy, sqlProfile } from './support/retention.js';

/** Review Focus 1: holds (incl. merged chains), resumable runs without double counts; planner purity; the cron. */

type Run = { id: string; status: string };

async function runRetention(org: string, at: string, batch = 500, budgetMs = 20000): Promise<Run> {
  const [r] = await runSqlRows(`select id, status from itap.run_retention('${org}', '${at}', ${batch}, ${budgetMs})`);
  return { id: String(r.id), status: String(r.status) };
}

async function classRows(run: string): Promise<Record<string, string | null>[]> {
  return runSqlRows(
    `select data_class, coalesce(facility_id::text, '') as facility, affected, skipped_by_hold, batches,
            (completed_at is not null)::text as done, coalesce(error, '') as error
     from itap.retention_run_classes where run_id = '${run}' order by data_class, facility`,
  );
}

const location = (org: string, facility: string, identity: string, at: string) =>
  insertRow('identity_locations', {
    organization_id: q(org), facility_id: q(facility), identity_id: q(identity), movement_type: q('entry'), occurred_at: q(at),
  });

const AT = '2020-06-01T00:00:00Z';
const OLD = '2020-01-01T00:00:00Z';

describe('retention runner', () => {
  it('should skip rows held through a merged chain and a linked profile', async () => {
    const w = await retentionWorld();
    const profile = await sqlProfile(w.org);
    const target = await sqlIdentity(w.org, { profile_id: q(profile) });
    const source = await sqlIdentity(w.org);
    const free = await sqlIdentity(w.org);
    const merge = await insertRow('identity_merges', { organization_id: q(w.org), target_identity_id: q(target) });
    await insertRow('identity_merge_sources', {
      organization_id: q(w.org), merge_id: q(merge), source_identity_id: q(source), previous_status: q('unverified'),
    });
    await sqlHold(w.org, { profile_id: profile });
    for (const id of [target, source, free]) await location(w.org, w.facility.id, id, OLD);
    await sqlPolicy(w.org, 'locations', 30);

    const run = await runRetention(w.org, AT);
    expect(run.status).toBe('completed');
    const rows = await classRows(run.id);
    expect(rows.find((r) => r.data_class === 'locations')).toMatchObject({ affected: '1', skipped_by_hold: '2', done: 'true' });
    expect(await count(`itap.identity_locations where identity_id in ('${target}', '${source}')`)).toBe(2);
    expect(await count(`itap.identity_locations where identity_id = '${free}'`)).toBe(0);
  });

  it('should resume a run across calls and after a crash without double counting', async () => {
    const w = await retentionWorld();
    const identity = await sqlIdentity(w.org);
    for (let i = 0; i < 5; i += 1) await location(w.org, w.facility.id, identity, OLD);
    await sqlPolicy(w.org, 'locations', 30);

    // One batch of 2 per call (budget 0): the run stays running with a lease.
    const first = await runRetention(w.org, AT, 2, 0);
    expect(first.status).toBe('running');
    // A crash inside the next call rolls back its batch and its counts together.
    await expect(
      runSql(`select * from itap.run_retention('${w.org}', '${AT}', 2, 0); select 1 / 0;`),
    ).rejects.toThrow(/division by zero/);
    expect(await count(`itap.identity_locations where identity_id = '${identity}'`)).toBe(3);
    let run = first;
    for (let i = 0; i < 10 && run.status === 'running'; i += 1) run = await runRetention(w.org, AT, 2, 0);
    expect(run).toEqual({ id: first.id, status: 'completed' });
    const loc = (await classRows(run.id)).find((r) => r.data_class === 'locations');
    expect(loc).toMatchObject({ affected: '5', done: 'true' });
    expect(await count(`itap.identity_locations where identity_id = '${identity}'`)).toBe(0);
    // Hasura redelivery of the same scheduled time: the finished run is returned unchanged.
    expect(await runRetention(w.org, AT)).toEqual(run);
    expect(await count(`itap.retention_runs where organization_id = '${w.org}'`)).toBe(1);
  });

  it('should close a run abandoned with an expired lease as interrupted and let the next run finish the work', async () => {
    const w = await retentionWorld();
    const identity = await sqlIdentity(w.org);
    for (let i = 0; i < 4; i += 1) await location(w.org, w.facility.id, identity, OLD);
    await sqlPolicy(w.org, 'locations', 30);
    const abandoned = await runRetention(w.org, AT, 1, 0);
    expect(abandoned.status).toBe('running');
    const next = '2020-06-02T00:00:00Z';
    await runSql(`update itap.retention_runs set lease_expires_at = now() - interval '1 minute' where id = '${abandoned.id}'`);
    const resumed = await runRetention(w.org, next);
    expect(resumed.status).toBe('completed');
    const [old] = await runSqlRows(`select status, finished_at is not null as finished from itap.retention_runs where id = '${abandoned.id}'`);
    expect(old).toEqual({ status: 'interrupted', finished: 't' });
    const [sum] = await runSqlRows(
      `select sum(affected)::int as n from itap.retention_run_classes where organization_id = '${w.org}' and data_class = 'locations'`,
    );
    expect(sum.n).toBe('4');
  });

  it('should apply the consent window setting through the runner (no policy needed)', async () => {
    const w = await retentionWorld();
    const profile = await sqlProfile(w.org);
    const identity = await sqlIdentity(w.org, { profile_id: q(profile) });
    await insertRow('identity_embeddings', {
      organization_id: q(w.org), identity_id: q(identity),
      embedding: `('[' || array_to_string(array_fill(0, ARRAY[511]) || 1, ',') || ']')::vector`,
    });
    await insertRow('consent_records', {
      organization_id: q(w.org), profile_id: q(profile), purpose: q('biometric_processing'), status: q('withdrawn'),
      granted_at: q('2019-01-01T00:00:00Z'), withdrawn_at: q('2020-05-01T00:00:00Z'),
    });
    await runSql(`update itap.organization_settings set consent_embedding_retention_days = 60 where organization_id = '${w.org}'`);
    await runRetention(w.org, AT);
    expect(await count(`itap.identity_embeddings where identity_id = '${identity}'`)).toBe(1);
    await runSql(`update itap.organization_settings set consent_embedding_retention_days = 30 where organization_id = '${w.org}'`);
    const run = await runRetention(w.org, '2020-06-03T00:00:00Z');
    expect((await classRows(run.id)).find((r) => r.data_class === 'embeddings_withdrawn')).toMatchObject({ affected: '1' });
    expect(await count(`itap.identity_embeddings where identity_id = '${identity}'`)).toBe(0);
  });
});

describe('retention runner failures', () => {
  it('should record a failing class on its row, finish the others and mark the run failed', async () => {
    const w = await retentionWorld();
    const identity = await sqlIdentity(w.org);
    await location(w.org, w.facility.id, identity, OLD);
    await sqlPolicy(w.org, 'locations', 30);
    await sqlPolicy(w.org, 'audit', 365);
    // A run scheduled ahead of time puts the audit cutoff inside the 365-day floor: that class refuses.
    const [r] = await runSqlRows(`select id, status, error from itap.run_retention('${w.org}', now() + interval '30 days', 500, 20000)`);
    expect(r).toMatchObject({ status: 'failed', error: '1 class(es) failed' });
    const rows = await classRows(String(r.id));
    expect(rows.find((x) => x.data_class === 'audit')).toMatchObject({ done: 'true', error: 'retention_floor' });
    expect(rows.find((x) => x.data_class === 'locations')).toMatchObject({ affected: '1', error: '' });
  });
});

describe('retention planner', () => {
  it('should report cutoffs, candidates and held rows per target without writing anything', async () => {
    const w = await retentionWorld();
    const held = await sqlIdentity(w.org);
    const free = await sqlIdentity(w.org);
    await sqlHold(w.org, { identity_id: held });
    await location(w.org, w.facility.id, held, OLD);
    await location(w.org, w.facility.id, free, OLD);
    await location(w.org, w.other.id, free, OLD);
    await sqlPolicy(w.org, 'locations', 30);
    await sqlPolicy(w.org, 'locations', 10, 'delete', w.other.id);
    const data = await w.a.request<{ retention_plan: Record<string, unknown>[] }>(
      `query($at: timestamptz) { retention_plan(args: { p_at: $at }) { data_class facility_id action retain_days cutoff candidates held } }`,
      { at: AT },
    );
    const plan = data.retention_plan.filter((p) => p.data_class === 'locations');
    expect(plan).toEqual([
      { data_class: 'locations', facility_id: w.other.id, action: 'delete', retain_days: 10, cutoff: '2020-05-22T00:00:00+00:00', candidates: 1, held: 0 },
      { data_class: 'locations', facility_id: null, action: 'delete', retain_days: 30, cutoff: '2020-05-02T00:00:00+00:00', candidates: 1, held: 1 },
    ]);
    expect(data.retention_plan.map((p) => p.data_class)).toContain('embeddings_withdrawn');
    expect(await count(`itap.identity_locations where organization_id = '${w.org}'`)).toBe(3);
    expect(await count(`itap.retention_runs where organization_id = '${w.org}'`)).toBe(0);
  });
});

describe('retention_cleanup cron', () => {
  beforeAll(requireBackend);

  it('should run every organization at the scheduled time and drain the file deletion queue', async () => {
    const w = await retentionWorld();
    const identity = await sqlIdentity(w.org);
    await location(w.org, w.facility.id, identity, OLD);
    await sqlPolicy(w.org, 'locations', 30);
    const upload = await uploadFile(orgAdminToken(w.userId, w.org), w.org, { kind: 'misc' });
    if (!('id' in upload)) throw new Error(`upload failed: ${upload.status}`);
    const file = upload.id;
    await runSql(`select itap.enqueue_file_deletion('${w.org}', '${file}', 'test')`);

    const res = await postTrigger('retention_cleanup', cronPayload('retention_cleanup', new Date(AT)));
    expect(res.status).toBe(200);
    const [run] = await runSqlRows(`select status from itap.retention_runs where organization_id = '${w.org}' and scheduled_at = '${AT}'`);
    expect(run.status).toBe('completed');
    expect(await count(`itap.identity_locations where identity_id = '${identity}'`)).toBe(0);
    expect(await queued(file)).toBe(false);
    expect(await count(`storage.files where id = '${file}'`)).toBe(0);
  });
});
