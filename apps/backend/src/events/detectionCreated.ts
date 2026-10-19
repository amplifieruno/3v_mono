import { defineEventHandler } from './types.js';

const EVALUATE = `
  mutation EvaluateDetection($detection: uuid!) {
    evaluate_detection(args: { p_detection: $detection }) { id }
  }
`;

/**
 * Event trigger `detection_created` (insert on itap.detections): Stage B of the detection pipeline (design §8.2).
 * All logic is in SQL (itap.evaluate_detection), which is idempotent, so Hasura's at-least-once redelivery and a
 * concurrent seed call write nothing twice. Errors propagate (500) so Hasura retries.
 */
export const detectionCreated = defineEventHandler(async (payload, ctx) => {
  const id = payload.event.data.new?.id;
  if (typeof id !== 'string' || id.length === 0) return { skipped: 'no_detection_id' };
  const data = await ctx.admin.request<{ evaluate_detection: { id: string }[] }>(EVALUATE, { detection: id });
  return { detection_id: id, events: data.evaluate_detection.length };
});
