import { HasuraError } from '../hasura/client.js';

/** Business refusal; the action layer maps it to ActionError(code, message). */
export class EnrollmentError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EnrollmentError';
    this.code = code;
  }
}

/** SQL guard code -> [EnrollmentError code, message]. */
const GUARDS: Record<string, [string, string]> = {
  identity_matching_disabled: ['identity_matching_disabled', 'Matching is disabled for the identity'],
  identity_merged_frozen: ['identity_merged_frozen', 'The identity was merged and is frozen'],
  // Restriction of processing (slice 10): biometric inserts, identity links and detections of a restricted profile.
  profile_processing_restricted: ['subject_restricted', 'Processing of this person is restricted'],
  subject_restricted: ['subject_restricted', 'Processing of this person is restricted'],
};

/** Turns SQL guard errors raised by photo/embedding inserts (Hasura errors) into coded EnrollmentErrors. */
export function mapGuardError(error: unknown): unknown {
  if (!(error instanceof HasuraError)) return error;
  const text = `${error.detail ?? ''} ${error.message}`;
  const guard = Object.keys(GUARDS).find((c) => text.includes(c));
  return guard ? new EnrollmentError(...GUARDS[guard]) : error;
}
