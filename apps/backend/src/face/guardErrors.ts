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

const GUARDS: Record<string, string> = {
  identity_matching_disabled: 'Matching is disabled for the identity',
  identity_merged_frozen: 'The identity was merged and is frozen',
};

/** Turns SQL guard errors raised by photo/embedding inserts (Hasura errors) into coded EnrollmentErrors. */
export function mapGuardError(error: unknown): unknown {
  if (!(error instanceof HasuraError)) return error;
  const text = `${error.detail ?? ''} ${error.message}`;
  const code = Object.keys(GUARDS).find((c) => text.includes(c));
  return code ? new EnrollmentError(code, GUARDS[code]) : error;
}
