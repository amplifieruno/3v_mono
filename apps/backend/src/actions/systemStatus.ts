import { z } from 'zod';
import { isLevel, probe, worst, type Check, type Level } from '../status/probes.js';
import { ActionError, defineAction } from './types.js';

const SNAPSHOT = `
  query SystemStatusSnapshot($org: uuid!, $at: timestamptz!) { system_status(args: { p_org: $org, p_at: $at }) { snapshot } }
`;

type Snapshot = {
  postgres: Record<string, unknown>;
  crons: { status?: unknown }[];
  queues: Record<string, number>;
  retention: Record<string, unknown> | null;
};

const origin = (url: string): string => new URL(url).origin;

function insightFaceDetails(body: string): Record<string, unknown> {
  const info = JSON.parse(body) as { version?: unknown; models?: { rec_name?: unknown; det_name?: unknown } };
  return { model: info.models?.rec_name ?? null, detector: info.models?.det_name ?? null, version: info.version ?? null };
}

/**
 * get_system_status (org_admin, spec §8.5): live probes of Hasura, Postgres (the snapshot query itself), InsightFace
 * (with its model), storage and the stream-server, each ok / degraded / down with its latency; Postgres figures,
 * cron lag per Hasura cron trigger, this organization's queue depths and last retention run (itap.system_status).
 * Platform metrics are global by nature (no tenant data); everything tenant-scoped is the caller's organization only.
 */
export const getSystemStatus = defineAction(z.unknown(), async (ctx) => {
  const org = ctx.session.organizationId?.toLowerCase();
  if (!org || ctx.session.role !== 'org_admin') throw new ActionError('forbidden', 'An organization admin session is required');
  const at = new Date();
  const started = performance.now();
  const snapshotPromise = ctx.admin
    .request<{ system_status: { snapshot: Snapshot }[] }>(SNAPSHOT, { org, at: at.toISOString() })
    .then((data) => ({ snapshot: data.system_status[0]?.snapshot ?? null, latency: Math.round(performance.now() - started), error: null }))
    .catch((error: unknown) => ({
      snapshot: null,
      latency: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    }));
  const [hasura, insightface, storage, streamServer, db] = await Promise.all([
    probe('hasura', `${origin(ctx.env.HASURA_GRAPHQL_URL)}/healthz`),
    probe('insightface', `${ctx.env.INSIGHTFACE_API_URL.replace(/\/+$/, '')}/info`, { details: insightFaceDetails }),
    probe('storage', `${origin(ctx.env.NHOST_STORAGE_URL)}/healthz`),
    probe('stream_server', `${ctx.env.STREAM_SERVER_URL.replace(/\/+$/, '')}/health`),
    snapshotPromise,
  ]);
  const postgres: Check = db.snapshot
    ? { name: 'postgres', status: db.latency > 2000 ? 'degraded' : 'ok', latency_ms: db.latency }
    : { name: 'postgres', status: 'down', latency_ms: db.latency, details: { error: db.error ?? 'no snapshot' } };
  const checks = [hasura, postgres, insightface, storage, streamServer];
  const crons = db.snapshot?.crons ?? [];
  const cronLevels: Level[] = crons.map((c) => (isLevel(c.status) ? c.status : 'ok'));
  return {
    generated_at: at.toISOString(),
    status: worst([...checks.map((c) => c.status), ...cronLevels]),
    checks,
    postgres: db.snapshot?.postgres ?? {},
    crons,
    queues: db.snapshot?.queues ?? {},
    retention: db.snapshot?.retention ?? null,
  };
});
