import { z } from 'zod';
import { evaluateSegment, mapSegmentError, previewSegment, SegmentError } from '../segments/evaluate.js';
import { ActionError, defineAction, type ActionContext } from './types.js';

/** Segment actions (spec §8.5): one evaluator, the backend translator (src/segments). */

function requireOrganization(ctx: ActionContext<unknown>): void {
  if (!ctx.session.organizationId) throw new ActionError('no_organization', 'An organization session is required');
}

async function asAction<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    const mapped = mapSegmentError(error);
    if (mapped instanceof SegmentError) throw new ActionError(mapped.code, mapped.message);
    throw mapped;
  }
}

const previewSchema = z.object({
  target: z.enum(['profiles', 'identities']),
  conditions: z.unknown().refine((c) => c !== null && c !== undefined, 'conditions are required'),
  limit: z.number().int().min(0).max(100).nullish(),
});

/** Count and sample of unsaved conditions, with the caller's permissions (asCaller). */
export const previewSegmentAction = defineAction(previewSchema, async (ctx) => {
  requireOrganization(ctx);
  return asAction(() =>
    previewSegment(ctx.asCaller, {
      target: ctx.input.target,
      conditions: ctx.input.conditions,
      limit: ctx.input.limit ?? 20,
      at: new Date().toISOString(),
    }),
  );
});

const evaluateSchema = z.object({ segment_id: z.string().uuid().transform((id) => id.toLowerCase()) });

/** Evaluates a dynamic segment now: reads as the caller, writes rule membership through the actor. */
export const evaluateSegmentAction = defineAction(evaluateSchema, async (ctx) => {
  requireOrganization(ctx);
  return asAction(() =>
    evaluateSegment({ reader: ctx.asCaller, writer: ctx.actor }, ctx.input.segment_id, new Date().toISOString()),
  );
});
