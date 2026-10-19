import { defineEventHandler } from './types.js';

const EVALUATE = `
  mutation EvaluateDetection($detection: uuid!) {
    evaluate_detection(args: { p_detection: $detection }) { id }
  }
`;
const DETECTION_EXISTS = `query DetectionExists($detection: uuid!) { detections_by_pk(id: $detection) { id } }`;

/**
 * Event trigger `detection_created` (insert on itap.detections): Stage B of the detection pipeline (design §8.2).
 * All logic is in SQL (itap.evaluate_detection), which is idempotent, so Hasura's at-least-once redelivery and a
 * concurrent seed call write nothing twice. A detection that vanished (its organization was deleted) is a no-op
 * success: the SQL returns no events, and any failure while the row is gone answers ok instead of retrying. Other
 * errors propagate (500) so Hasura retries.
 */
export const detectionCreated = defineEventHandler(async (payload, ctx) => {
  const id = payload.event.data.new?.id;
  if (typeof id !== 'string' || id.length === 0) return { skipped: 'no_detection_id' };
  try {
    const data = await ctx.admin.request<{ evaluate_detection: { id: string }[] }>(EVALUATE, { detection: id });
    return { detection_id: id, events: data.evaluate_detection.length };
  } catch (error) {
    const check = await ctx.admin
      .request<{ detections_by_pk: { id: string } | null }>(DETECTION_EXISTS, { detection: id })
      .catch(() => ({ detections_by_pk: { id } }));
    if (check.detections_by_pk === null) return { detection_id: id, skipped: 'detection_gone' };
    throw error;
  }
});
