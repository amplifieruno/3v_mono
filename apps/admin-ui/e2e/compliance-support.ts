import { runSql } from './access-cleanup';

/** What `compliance.spec.ts` wrote during a run, for {@link removeComplianceRun}. */
export interface ComplianceRun {
  /** Run marker: holds and export definitions are named `<run> …`, the throwaway person `Throwaway <run>`. */
  readonly run: string;
  organizationId: string;
  /** The throwaway person the run created (the only person it ever erases). */
  throwaway: string;
  /** Files the run produced (export files): queued for deletion. */
  readonly files: Set<string>;
}

const quoted = (ids: Iterable<string>): string => [...ids].map((id) => `'${id}'`).join(', ') || 'null';

const ids = async (sql: string): Promise<string[]> =>
  (await runSql(sql)).map(([id]) => id ?? '').filter((id) => id !== '');

/** The counts a retention dry run must leave unchanged: runs, run classes, retention queue rows, retention audit rows. */
export async function retentionFootprint(organizationId: string): Promise<string> {
  const [row] = await runSql(
    `select (select count(*) from itap.retention_runs where organization_id = '${organizationId}'),
            (select count(*) from itap.retention_run_classes c join itap.retention_runs r on r.id = c.run_id where r.organization_id = '${organizationId}'),
            (select count(*) from itap.pending_file_deletions where reason like 'retention:%'),
            (select count(*) from itap.audit_log where organization_id = '${organizationId}' and changes = '{"retention": true}'::jsonb and entity <> 'organization_settings')`,
  );
  return (row ?? []).join('/');
}

/**
 * Removes everything a run wrote, with the admin secret (requests have no delete permission, holds
 * are never deleted, audit rows are append-only): the throwaway person's requests and their audit
 * rows, the run's holds (ended first) with their targets, the run's export definitions and jobs,
 * the files (queued for deletion), the throwaway person, and the audit rows all of these wrote,
 * including the organization-settings row the person's deletion writes at commit. Answers what is
 * left (0 when clean).
 */
export async function removeComplianceRun(run: ComplianceRun): Promise<number> {
  const holds = await ids(`select id from itap.legal_holds where name like '${run.run}%'`);
  const definitions = await ids(`select id from itap.export_definitions where name like '${run.run}%'`);
  const requests = run.throwaway === '' ? [] : await ids(`select id from itap.data_subject_requests where profile_id = '${run.throwaway}'`);
  const jobs = await ids(`select id from itap.export_jobs where definition_id in (${quoted(definitions)})`);
  const throwaway = run.throwaway === '' ? [] : [run.throwaway];
  const org = `organization_id = '${run.organizationId}'`;
  for (const file of await ids(`select file_id from itap.export_jobs where definition_id in (${quoted(definitions)}) and file_id is not null`)) {
    run.files.add(file);
  }
  const [[started = ''] = []] = await runSql('select now()');
  await runSql(
    [
      "select set_config('itap.retention_context', 'on', true)",
      `delete from itap.data_subject_requests where id in (${quoted(requests)})`,
      `delete from itap.audit_log where entity_id in (${quoted(requests)}) or changes ->> 'request_id' in (${quoted(requests)})`,
      `delete from itap.audit_log where (entity = 'export_definitions' and entity_id in (${quoted(definitions)})) or (entity = 'export_jobs' and changes ->> 'definition_id' in (${quoted(definitions)}))`,
      `delete from itap.export_jobs where definition_id in (${quoted(definitions)})`,
      `delete from itap.export_definitions where id in (${quoted(definitions)})`,
      `delete from itap.audit_log where entity_id in (${quoted(run.files)}) or changes ->> 'file_id' in (${quoted(run.files)})`,
      ...(run.files.size > 0
        ? [`select itap.enqueue_unused_files('${run.organizationId}', array[${quoted(run.files)}]::uuid[], 'test:compliance-e2e')`]
        : []),
      `update itap.legal_holds set ends_at = now() where id in (${quoted(holds)}) and (ends_at is null or ends_at > now())`,
      `delete from itap.legal_hold_targets where hold_id in (${quoted(holds)})`,
      `delete from itap.legal_holds where id in (${quoted(holds)})`,
      `delete from itap.audit_log where entity in ('legal_holds', 'legal_hold_targets') and (entity_id in (${quoted(holds)}) or changes ->> 'hold_id' in (${quoted(holds)}))`,
      `delete from itap.profiles where id in (${quoted(throwaway)})`,
      `delete from itap.audit_log where entity_id in (${quoted(throwaway)}) or changes ->> 'profile_id' in (${quoted(throwaway)})`,
      // The audit rows this cleanup itself wrote (this transaction).
      `delete from itap.audit_log where occurred_at >= now() and ${org} and entity in ('legal_holds', 'legal_hold_targets', 'profiles', 'export_jobs', 'export_definitions', 'data_subject_requests')
         and (entity_id in (${quoted([...holds, ...definitions, ...jobs, ...requests, ...throwaway])})
              or changes ->> 'hold_id' in (${quoted(holds)}) or changes ->> 'definition_id' in (${quoted(definitions)})
              or changes ->> 'profile_id' in (${quoted(throwaway)}) or changes ->> 'request_id' in (${quoted(requests)}))`,
    ].join(';\n'),
  );
  // Deleting the person bumps the organization's settings at commit (a deferred trigger): that audit row goes too.
  await runSql(
    `select set_config('itap.retention_context', 'on', true); delete from itap.audit_log where ${org} and entity = 'organization_settings' and changes = '{"retention": true}'::jsonb and occurred_at >= '${started}'`,
  );
  const [[left = '1'] = []] = await runSql(
    `select (select count(*) from itap.legal_holds where name like '${run.run}%')
          + (select count(*) from itap.export_definitions where name like '${run.run}%')
          + (select count(*) from itap.profiles where id in (${quoted(throwaway)}))
          + (select count(*) from itap.data_subject_requests where id in (${quoted(requests)}))`,
  );
  return Number(left);
}
