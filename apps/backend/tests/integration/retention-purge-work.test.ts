import { describe, expect, it } from 'vitest';
import { sqlHold } from './support/compliance.js';
import { runSql, runSqlRows } from './support/sql.js';
import {
  ago,
  count,
  fileRow,
  insertRow,
  purge,
  purgeAll,
  q,
  queued,
  retentionWorld,
  sqlIdentity,
} from './support/retention.js';

/** Retention classes search_history, bulk_jobs, reports. */

const search = (org: string, user: string, days: number, extra: Record<string, string> = {}) =>
  insertRow('search_requests', {
    organization_id: q(org), user_id: q(user), search_type: q('facial'), status: q('completed'), created_at: ago(days),
    ...extra,
  });

const result = (org: string, request: string, identity: string, rank = 1) =>
  insertRow('search_results', {
    organization_id: q(org), search_request_id: q(request), identity_id: q(identity), rank: String(rank), match_type: q('exact'),
  });

/** Bulk job inserted as the seed would (no input upload needed), then finished. */
async function bulkJob(org: string, owner: string, days: number, extra: Record<string, string> = {}): Promise<string> {
  const cols = { organization_id: q(org), kind: q('bulk_search'), owner_id: q(owner), status: q('completed'), completed_at: ago(days), ...extra };
  const [r] = await runSqlRows(
    `select set_config('itap.seed_context', 'on', true);
     insert into itap.bulk_jobs (${Object.keys(cols).join(', ')}) values (${Object.values(cols).join(', ')}) returning id`,
  );
  return String(r.id);
}

const report = (org: string, days: number, extra: Record<string, string> = {}) =>
  insertRow('reports', {
    organization_id: q(org), report_type: q('occupancy'), title: q('Occupancy'), start_date: `(now() - interval '${days + 7} days')::date`,
    end_date: `(now() - interval '${days} days')::date`, status: q('completed'), generated_at: ago(days), ...extra,
  });

describe('retention: search history', () => {
  it('should delete finished searches (results cascade, images queued) except held ones and saved-search baselines', async () => {
    const w = await retentionWorld();
    const free = await sqlIdentity(w.org);
    const held = await sqlIdentity(w.org);
    await sqlHold(w.org, { identity_id: held });
    const image = await fileRow(w.org, 'misc');
    const gone = await search(w.org, w.userId, 40, { image_file_id: q(image), status: q('running') });
    await result(w.org, gone, free);
    const heldSearch = await search(w.org, w.userId, 40, { status: q('running') });
    await result(w.org, heldSearch, held);
    await runSql(`update itap.search_requests set status = 'completed' where id in ('${gone}', '${heldSearch}')`);
    const running = await search(w.org, w.userId, 40, { status: q('running') });
    const baseline = await search(w.org, w.userId, 40);
    await insertRow('saved_searches', {
      organization_id: q(w.org), owner_id: q(w.userId), name: q('Watch'), search_type: q('attribute'),
      last_search_request_id: q(baseline),
    });

    expect(await purgeAll('search_history', w.org, ago(30))).toEqual({ affected: 1, skipped_by_hold: 1, files_enqueued: 1 });
    expect(await count(`itap.search_requests where id = '${gone}'`)).toBe(0);
    expect(await count(`itap.search_results where search_request_id = '${gone}'`)).toBe(0);
    expect(await queued(image)).toBe(true);
    expect(await count(`itap.search_requests where id in ('${heldSearch}', '${running}', '${baseline}')`)).toBe(3);
  });
});

describe('retention: bulk jobs', () => {
  it('should delete finished jobs with rows, search requests and files', async () => {
    const w = await retentionWorld();
    const result = await fileRow(w.org, 'bulk_result');
    const tagged = await fileRow(w.org, 'bulk_result', {});
    const job = await bulkJob(w.org, w.userId, 40, { result_file_id: q(result) });
    await runSql(`update storage.files set metadata = metadata || '{"bulk_job_id":"${job}"}'::jsonb where id = '${tagged}'`);
    await insertRow('bulk_job_rows', { organization_id: q(w.org), bulk_job_id: q(job), row_no: '1', outcome: q('matched') });
    await search(w.org, w.userId, 40, { bulk_job_id: q(job), bulk_job_row_no: '1' });
    const running = await bulkJob(w.org, w.userId, 40, { status: q('running'), completed_at: 'null' });

    expect(await purgeAll('bulk_jobs', w.org, ago(30))).toEqual({ affected: 1, skipped_by_hold: 0, files_enqueued: 2 });
    expect(await count(`itap.bulk_jobs where id = '${job}'`)).toBe(0);
    expect(await count(`itap.search_requests where bulk_job_id = '${job}'`)).toBe(0);
    expect(await queued(result)).toBe(true);
    expect(await queued(tagged)).toBe(true);
    expect(await count(`itap.bulk_jobs where id = '${running}'`)).toBe(1);
  });

  it('should archive jobs: the job row and counters stay, rows and files go', async () => {
    const w = await retentionWorld();
    const file = await fileRow(w.org, 'bulk_result');
    const job = await bulkJob(w.org, w.userId, 40, { result_file_id: q(file), processed: '1' });
    await insertRow('bulk_job_rows', { organization_id: q(w.org), bulk_job_id: q(job), row_no: '1', outcome: q('matched') });
    expect(await purge('bulk_jobs', w.org, ago(30), { action: 'archive' })).toMatchObject({ affected: 1, files_enqueued: 1 });
    const [j] = await runSqlRows(`select result_file_id, processed, status from itap.bulk_jobs where id = '${job}'`);
    expect(j).toEqual({ result_file_id: 'NULL', processed: '1', status: 'completed' });
    expect(await count(`itap.bulk_job_rows where bulk_job_id = '${job}'`)).toBe(0);
    expect(await purge('bulk_jobs', w.org, ago(30), { action: 'archive' })).toMatchObject({ affected: 0 });
  });
});

describe('retention: reports', () => {
  it('should delete old reports with their files and archive (expire) them without the file', async () => {
    const w = await retentionWorld();
    const file = await fileRow(w.org, 'report');
    const gone = await report(w.org, 40, { file_id: q(file) });
    const fresh = await report(w.org, 2);
    expect(await purgeAll('reports', w.org, ago(30))).toEqual({ affected: 1, skipped_by_hold: 0, files_enqueued: 1 });
    expect(await count(`itap.reports where id = '${gone}'`)).toBe(0);
    expect(await count(`itap.reports where id = '${fresh}'`)).toBe(1);
    expect(await queued(file)).toBe(true);

    const archFile = await fileRow(w.org, 'report');
    const archived = await report(w.org, 40, { file_id: q(archFile) });
    await insertRow('report_metrics', {
      organization_id: q(w.org), report_id: q(archived), metric_name: q('visits'), metric_type: q('count'), value: '3',
    });
    expect(await purgeAll('reports', w.org, ago(30), { action: 'archive' })).toMatchObject({ affected: 1, files_enqueued: 1 });
    const [r] = await runSqlRows(`select status, file_id from itap.reports where id = '${archived}'`);
    expect(r).toEqual({ status: 'expired', file_id: 'NULL' });
    expect(await count(`itap.report_metrics where report_id = '${archived}'`)).toBe(0);
    // Reports name no person: a subject call touches none.
    expect(await purge('reports', w.org, 'now()', { subjectIdentity: await sqlIdentity(w.org) })).toMatchObject({ affected: 0 });
  });
});
