import type { StorageClient } from '../storage/storageClient.js';
import { nextStep, publicAttributes, type NextStep } from './response.js';
import type { SessionState } from './store.js';

/**
 * GET /v1/auth/sessions/{id}: polling a session (e.g. a partial match referred to manual review). next_step: capture
 * on a fresh session, then as after the last capture (review while referred, none once closed).
 */
export async function sessionStatusResponse(requestId: string, state: SessionState, storage: StorageClient) {
  let next: NextStep = 'none';
  if (state.status === 'review') next = 'review';
  else if (state.status === 'open' && state.step_count === 0) next = 'capture';
  else if (state.status === 'open' && state.last_outcome === 'partial_match') {
    next = nextStep({ outcome: 'partial_match', session_status: 'open', recapture_count: state.recapture_count }, state.mode);
  } else if (state.status === 'open') next = 'recapture';
  const succeeded = state.status === 'succeeded' && state.matched_identity_id !== null;
  return {
    request_id: requestId,
    session_id: state.session_id,
    timestamp: new Date().toISOString(),
    mode: state.mode,
    status: state.status,
    step: state.step,
    attempts: state.step_count,
    recapture_count: state.recapture_count,
    expires_at: state.expires_at,
    last_outcome: state.last_outcome,
    last_failure_code: state.last_failure_reason,
    review_status: state.review_status,
    authenticated: succeeded,
    ...(succeeded && state.matched_identity_id
      ? { identity: { id: state.matched_identity_id, attributes: await publicAttributes(state.attributes ?? {}, storage) } }
      : {}),
    next_step: next,
  };
}
