import type { StoredAuth } from '../../src/auth/types';

/** The sessions the dev-stack global setup signs in, keyed by `sessionKey(email, organization)`. */
export type DevSessions = Record<string, StoredAuth>;

declare module 'vitest' {
  export interface ProvidedContext {
    devSessions: DevSessions;
  }
}

/** The (email, organization) pairs signed in once per run; `undefined` = the organization sign-in opens. */
export const DEV_SESSION_LOGINS: readonly (readonly [string, string | undefined])[] = [
  ['admin@itap.demo', undefined],
  ['admin@itap.demo', 'Nova Tower Business Center'],
];

export function sessionKey(email: string, organizationName?: string): string {
  return `${email}|${organizationName ?? ''}`;
}
