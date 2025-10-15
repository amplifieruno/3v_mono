import { createClient } from '@nhost/nhost-js';

export const nhost = createClient({
  subdomain: 'local',
  region: 'local',
  // authUrl: 'http://local.auth.local.nhost.run/v1',
  authUrl: '/auth/v1',
  // graphqlUrl: import.meta.env.VITE_NHOST_GRAPHQL_URL,
  // storageUrl: import.meta.env.VITE_NHOST_STORAGE_URL,
  // clientStorageType: 'localStorage',
  // clientStorage: typeof window !== 'undefined' ? window.localStorage : null,
});
