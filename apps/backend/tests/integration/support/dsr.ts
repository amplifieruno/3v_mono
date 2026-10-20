import { inflateRawSync } from 'node:zlib';
import { crc32 } from '../../../src/reports/render/zip.js';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { asAdmin } from './clients.js';
import { insertOne } from './operations.js';
import { waitFor } from './sending.js';
import { runSqlRows } from './sql.js';

/** Data subject requests (slice 10 task 3): rows, steps, the job's SQL functions and the bundle zip. */

export type Dsr = {
  id: string;
  code: string;
  organization_id: string;
  profile_id: string | null;
  request_type: string;
  status: string;
  partial: boolean;
  details: Record<string, unknown>;
  outcome: string | null;
  notes: string | null;
  rejection_reason: string | null;
  completed_at: string | null;
  export_file_id: string | null;
  attempts: number;
  attempts_at_retry: number;
  lease_expires_at: string | null;
  last_error: string | null;
  overdue_notified_at: string | null;
  due_at: string;
};
export const DSR_FIELDS = `id code organization_id profile_id request_type status partial details outcome notes rejection_reason
  completed_at export_file_id attempts attempts_at_retry lease_expires_at last_error overdue_notified_at due_at`;

export type Step = { step: string; details: Record<string, unknown> };

/** Files a request as org_admin (the insert fires fulfil_dsr in the backend container). */
export function fileDsr(a: HasuraClient, profile: string, type: string, extra: Record<string, unknown> = {}): Promise<Dsr> {
  return insertOne<Dsr>(a, 'data_subject_requests', { profile_id: profile, request_type: type, ...extra }, DSR_FIELDS);
}

export async function readDsr(id: string): Promise<Dsr> {
  const data = await asAdmin().request<{ data_subject_requests_by_pk: Dsr }>(
    `query($id: uuid!) { data_subject_requests_by_pk(id: $id) { ${DSR_FIELDS} } }`,
    { id },
  );
  return data.data_subject_requests_by_pk;
}

const closed = (d: Dsr): boolean => d.status === 'completed' || d.status === 'rejected';

/** Waits until the job closed the request (or `done` holds). */
export function settledDsr(id: string, done: (d: Dsr) => boolean = closed, timeoutMs = 90000): Promise<Dsr> {
  return waitFor(() => readDsr(id), done, timeoutMs);
}

/** Waits until a rectification request waits for the manual change (in_progress, no lease). */
export const awaitingDsr = (id: string): Promise<Dsr> =>
  settledDsr(id, (d) => d.status === 'in_progress' && d.lease_expires_at === null && d.attempts > 0);

export async function dsrSteps(id: string): Promise<Step[]> {
  const rows = await runSqlRows(`select step, details::text as details from itap.dsr_steps where request_id = '${id}' order by at, created_at, id`);
  return rows.map((r) => ({ step: String(r.step), details: JSON.parse(r.details ?? '{}') as Record<string, unknown> }));
}

/** A job SQL function `itap.<fn>(request, attempt, ...)` (admin); returns the rows' ids. */
export async function jobCall(fn: string, args: string): Promise<Record<string, string | null>[]> {
  return runSqlRows(`select x.* from itap.${fn}(${args}) x`);
}

export type ZipEntry = { name: string; data: Buffer };

/** Reads a ZIP archive through its central directory; checks every entry's CRC-32 (test-side reader). */
export function readZip(buf: Buffer): ZipEntry[] {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('zip: no end of central directory');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central header');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLength = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    if (buf.readUInt32LE(offset) !== 0x04034b50) throw new Error(`zip: bad local header for ${name}`);
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const raw = buf.subarray(start, start + compressed);
    const data = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    if (crc32(data) !== crc) throw new Error(`zip: CRC mismatch for ${name}`);
    entries.push({ name, data });
    p += 46 + nameLength + extra + comment;
  }
  return entries;
}
