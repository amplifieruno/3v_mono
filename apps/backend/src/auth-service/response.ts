import type { StorageClient } from '../storage/storageClient.js';
import { FAILURE_TEXTS } from './errors.js';
import type { PublicDecision } from './store.js';

/** `capture` only on a polled fresh session (no capture sent yet): send the first sequence to /authenticate. */
export type NextStep = 'capture' | 'recapture' | 'second_factor' | 'review' | 'none';

export type Failure = { code: string; message: string; guidance: string; retryable: boolean };

export type AuthenticationResponse = {
  request_id: string;
  session_id: string;
  timestamp: string;
  outcome: 'success' | 'partial_match' | 'failure';
  authenticated: boolean;
  confidence?: number;
  identity?: { id: string; attributes: Record<string, unknown> };
  attack_outcome: string;
  failure?: Failure;
  next_step: NextStep;
};

export type Mode = 'identification' | 'verification' | string;

/**
 * The step the application should take next (as the SQL accepts it). Partial match while the session is open:
 * verification offers the second factor right away (a recapture is still accepted instead), identification a
 * recapture (it never offers a second factor: the candidate was not named by the client); manual review once no
 * recapture is left (the engine queued it). A failure is retryable only while the session stays open (quality
 * failures with recaptures left).
 */
export function nextStep(d: Pick<PublicDecision, 'outcome' | 'session_status' | 'recapture_count'>, mode: Mode): NextStep {
  if (d.outcome === 'success') return 'none';
  if (d.outcome === 'partial_match') {
    if (d.session_status === 'review') return 'review';
    if (d.session_status !== 'open') return 'none';
    return mode === 'verification' ? 'second_factor' : 'recapture';
  }
  return d.session_status === 'open' ? 'recapture' : 'none';
}

export function failureOf(code: string, retryable: boolean): Failure {
  const text = FAILURE_TEXTS[code] ?? FAILURE_TEXTS.below_threshold;
  return { code: FAILURE_TEXTS[code] ? code : 'below_threshold', message: text.message, guidance: text.guidance, retryable };
}

/**
 * Permitted attributes as sent to the application: exactly the keys the engine returned (the app's permitted set);
 * `photo` (a file id inside the platform) becomes a short-lived signed URL `{ url, expires_at }` from the storage
 * presign API, or null when there is no photo or it cannot be signed.
 */
export async function publicAttributes(attributes: Record<string, unknown>, storage: StorageClient): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...attributes };
  if ('photo' in out) {
    const fileId = out.photo;
    out.photo = null;
    if (typeof fileId === 'string' && fileId.length > 0) {
      try {
        const { url, expiresAt } = await storage.presignedUrl(fileId);
        out.photo = { url, expires_at: expiresAt.toISOString() };
      } catch {
        out.photo = null;
      }
    }
  }
  return out;
}

/** Public body of a decision: identity / confidence only for success; no candidate or score otherwise. */
export async function authenticationResponse(
  requestId: string,
  d: PublicDecision,
  storage: StorageClient,
  mode: Mode,
): Promise<AuthenticationResponse> {
  const step = nextStep(d, mode);
  const body: AuthenticationResponse = {
    request_id: requestId,
    session_id: d.session_id,
    timestamp: new Date().toISOString(),
    outcome: d.outcome,
    authenticated: d.outcome === 'success',
    attack_outcome: d.attack_outcome,
    next_step: step,
  };
  if (d.outcome === 'success' && d.matched_identity_id) {
    body.confidence = d.confidence ?? undefined;
    body.identity = { id: d.matched_identity_id, attributes: await publicAttributes(d.attributes ?? {}, storage) };
  } else if (d.outcome === 'partial_match') {
    body.failure = failureOf('partial_match', step === 'recapture' || step === 'second_factor');
  } else {
    body.failure = failureOf(d.failure_reason ?? 'below_threshold', step === 'recapture');
  }
  return body;
}
