import type { ItapAuthProvider, ItapIdentity } from '../../src/auth';

/**
 * Shared by the jsdom tests that mount the whole console on one record page:
 * the browser APIs jsdom lacks, a signed-in `org_admin` of one organization,
 * and Hasura answers (the path probe is `./location-probe.tsx`).
 */

/** `matchMedia` and `ResizeObserver`, which the shell's components read. */
export function installDomShims(): void {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) satisfies MediaQueryList;
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

/** Signed in as an `org_admin` of `organizationId`; every request carries `fake-org-token`. */
export function fakeAdminAuth(organizationId: string, organizationName: string): ItapAuthProvider {
  const identity: ItapIdentity = {
    id: 'user-1',
    email: 'admin@itap.demo',
    name: 'Admin',
    roles: ['org_admin'],
    organizationId,
    memberships: [
      { organizationId, name: organizationName, logoFileId: null, role: 'admin', status: 'active' },
    ],
  };
  return {
    check: async () => ({ authenticated: true }),
    getIdentity: async () => identity,
    login: async () => ({ success: true }),
    logout: async () => ({ success: true }),
    onError: async (error) => ({ action: 'propagate', error }),
    getToken: async () => 'fake-org-token',
    switchOrganization: async () => ({ success: true }),
  };
}

/** A Hasura answer (`{ data }` or `{ errors }`) as the provider reads it. */
export function hasuraResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
