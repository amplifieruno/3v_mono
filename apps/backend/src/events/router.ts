import express, { Router, type NextFunction, type Request, type Response } from 'express';
import type { Env } from '../config/env.js';
import { createHasuraClient } from '../hasura/client.js';
import { requireWebhookSecret } from '../hasura/webhookSecret.js';
import { resumeBulkJobs, runBulkJobTrigger } from '../bulk/handlers.js';
import { renderReport, runReportSchedules } from '../reports/schedules.js';
import { runSavedSearches } from '../search/savedSearches.js';
import { evaluateSegmentsHourly, evaluateSegmentsPending } from '../segments/crons.js';
import { aggregateStatsCron } from './analyticsCrons.js';
import { detectionCreated } from './detectionCreated.js';
import { deviceHealthCheck } from './deviceHealthCheck.js';
import { heartbeat } from './heartbeat.js';
import { escalate, sendDigests } from './notificationCrons.js';
import { purgeTriggerLogs } from './purgeTriggerLogs.js';
import { retryDeliveries, retryWebhooks, sendDelivery, sendWebhook } from './sending.js';
import { closeStaleSessions, evaluateDwellRules, lifecycleJobs } from './trackingCrons.js';
import {
  cronTriggerPayloadSchema,
  eventTriggerPayloadSchema,
  idempotencyKey,
  type EventHandlers,
  type TriggerResult,
} from './types.js';

export {
  defineCronHandler,
  defineEventHandler,
  idempotencyKey,
  type CronTriggerPayload,
  type EventHandlers,
  type EventTriggerPayload,
  type TriggerContext,
} from './types.js';

/** Handler registry: the key is the Hasura trigger name (`/hasura/events/<name>`). */
export const defaultEventHandlers: EventHandlers = {
  heartbeat,
  device_health_check: deviceHealthCheck,
  detection_created: detectionCreated,
  close_stale_sessions: closeStaleSessions,
  evaluate_dwell_rules: evaluateDwellRules,
  lifecycle_jobs: lifecycleJobs,
  purge_trigger_logs: purgeTriggerLogs,
  send_delivery: sendDelivery,
  send_webhook: sendWebhook,
  retry_deliveries: retryDeliveries,
  retry_webhooks: retryWebhooks,
  escalate,
  send_digests: sendDigests,
  evaluate_segments_pending: evaluateSegmentsPending,
  evaluate_segments: evaluateSegmentsHourly,
  aggregate_stats: aggregateStatsCron,
  render_report: renderReport,
  run_report_schedules: runReportSchedules,
  run_saved_searches: runSavedSearches,
  run_bulk_job: runBulkJobTrigger,
  resume_bulk_jobs: resumeBulkJobs,
};

function sendError(res: Response, status: number, error: string, message: string): void {
  res.status(status).json({ ok: false, error, message });
}

/**
 * Hasura event and cron trigger webhook router: `POST /:name`. Authenticated like actions (x-action-secret, checked
 * before parsing). Any non-2xx answer makes Hasura retry per the trigger's retry_conf, so handler errors are 500.
 */
export function eventsRouter(env: Env, handlers: EventHandlers = defaultEventHandlers): Router {
  const router = Router();
  router.use(requireWebhookSecret(env.ACTION_SECRET));
  router.use(express.json({ limit: '1mb' }));

  router.post('/:name', async (req: Request, res: Response) => {
    const name = req.params.name;
    const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
    if (!handler) {
      sendError(res, 404, 'unknown_trigger', `Unknown trigger: ${name}`);
      return;
    }
    const ctxFor = (id: string) => ({ env, admin: createHasuraClient(env), idempotencyKey: idempotencyKey(name, id) });

    let run: (() => Promise<TriggerResult>) | undefined;
    if (handler.kind === 'event') {
      const parsed = eventTriggerPayloadSchema.safeParse(req.body);
      if (parsed.success && parsed.data.trigger.name === name) {
        run = () => handler.handle(parsed.data, ctxFor(parsed.data.id));
      }
    } else {
      const parsed = cronTriggerPayloadSchema.safeParse(req.body);
      if (parsed.success && parsed.data.name === name) {
        run = () => handler.handle(parsed.data, ctxFor(parsed.data.id));
      }
    }
    if (!run) {
      sendError(res, 400, 'invalid_payload', `Invalid ${handler.kind} trigger payload for ${name}`);
      return;
    }

    try {
      const result = await run();
      res.status(200).json({ ok: true, ...(result ?? {}) });
    } catch (error: unknown) {
      console.error(`Trigger ${name} failed:`, error);
      sendError(res, 500, 'internal', 'Internal error');
    }
  });

  // Malformed JSON from an authenticated caller.
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (error instanceof SyntaxError) {
      sendError(res, 400, 'invalid_payload', 'Invalid JSON body');
      return;
    }
    next(error);
  });

  return router;
}
