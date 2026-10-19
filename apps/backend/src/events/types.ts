import { z } from 'zod';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';

/** Hasura event trigger delivery (design §8.4). Retries of one delivery keep the same `id`. */
export const eventTriggerPayloadSchema = z.object({
  id: z.string().min(1),
  created_at: z.string().optional(),
  trigger: z.object({ name: z.string().min(1) }),
  table: z.object({ schema: z.string(), name: z.string() }),
  delivery_info: z.object({ max_retries: z.number(), current_retry: z.number() }).optional(),
  event: z.object({
    op: z.enum(['INSERT', 'UPDATE', 'DELETE', 'MANUAL']),
    session_variables: z.record(z.string()).nullable(),
    data: z.object({
      old: z.record(z.unknown()).nullable(),
      new: z.record(z.unknown()).nullable(),
    }),
  }),
});

/** Hasura cron trigger delivery (design §8.3). Retries of one scheduled run keep the same `id`. */
export const cronTriggerPayloadSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  scheduled_time: z.string().min(1),
  payload: z.unknown(),
  comment: z.string().nullable().optional(),
});

export type EventTriggerPayload = z.infer<typeof eventTriggerPayloadSchema>;
export type CronTriggerPayload = z.infer<typeof cronTriggerPayloadSchema>;

export interface TriggerContext {
  env: Env;
  /** Admin-secret client: triggers carry no caller; handlers scope every write to the row's organization. */
  admin: HasuraClient;
  /** `<trigger name>:<delivery id>`, identical across Hasura retries of one delivery. */
  idempotencyKey: string;
}

/** Whatever a handler returns is merged into `{ ok: true, ... }`. */
export type TriggerResult = Record<string, unknown> | void;

export type EventHandler = {
  kind: 'event';
  handle: (payload: EventTriggerPayload, ctx: TriggerContext) => Promise<TriggerResult>;
};
export type CronHandler = {
  kind: 'cron';
  handle: (payload: CronTriggerPayload, ctx: TriggerContext) => Promise<TriggerResult>;
};
export type TriggerHandler = EventHandler | CronHandler;
export type EventHandlers = Record<string, TriggerHandler>;

export function defineEventHandler(handle: EventHandler['handle']): EventHandler {
  return { kind: 'event', handle };
}

export function defineCronHandler(handle: CronHandler['handle']): CronHandler {
  return { kind: 'cron', handle };
}

/** Dedup key for idempotent handlers (unique keys / ON CONFLICT): stable across retries of one delivery. */
export function idempotencyKey(triggerName: string, deliveryId: string): string {
  return `${triggerName}:${deliveryId}`;
}
