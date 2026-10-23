import type { StoredAuth } from '../../src/auth/types';
import { ADMIN_EMAIL, NOVA_ADMIN_EMAIL, NOVA_NAME } from './dev-hosts';

/** The sessions the dev-stack global setup signs in, keyed by `sessionKey(email, organization)`. */
export type DevSessions = Record<string, StoredAuth>;

declare module 'vitest' {
  export interface ProvidedContext {
    devSessions: DevSessions;
  }
}

/** The (email, organization) pairs signed in once per run; `undefined` = the organization sign-in opens. */
export const DEV_SESSION_LOGINS: readonly (readonly [string, string | undefined])[] = [
  [ADMIN_EMAIL, undefined],
  [ADMIN_EMAIL, NOVA_NAME],
  // The second member of a four-eyes approval (access policies).
  [NOVA_ADMIN_EMAIL, NOVA_NAME],
];

export function sessionKey(email: string, organizationName?: string): string {
  return `${email}|${organizationName ?? ''}`;
}
