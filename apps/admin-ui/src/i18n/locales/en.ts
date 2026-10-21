import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * App chrome in the `common` namespace (English, primary). Labels declared in
 * code (`texts`) are not repeated here; this bundle holds what code does not
 * declare: the console chrome and the glossary.
 */
export default {
  /** The shell, the auth pages and the sidebar switchers (`src/app`, `src/auth`). */
  console: {
    brand: 'ITAP',
    subtitle: 'Identity tracking and access',
    organization: 'Organization',
    facility: 'Facility',
    allFacilities: 'All facilities',
    signOut: 'Sign out',
    organizations: {
      title: 'Choose an organization',
      description: 'You are a member of several organizations. You can switch later from the sidebar.',
      noneTitle: 'No active organization',
      noneBody:
        'Your account has no active organization membership, so there is nothing to open yet. ' +
        'Ask an administrator of your organization to invite you or to reactivate your membership.',
    },
  },
  /**
   * Glossary terms, listed in `DocsConfig.concepts` (`../../docs.ts`) and
   * reachable from any doc through `doc.see: 'concept/<term>'`.
   */
  concepts: {
    'organization-token': {
      label: 'Organization token',
      doc: {
        summary:
          'The short-lived access token (15 minutes) the console works with inside one ' +
          'organization. It is issued by the `switch_organization` action after sign-in, ' +
          'carries the organization id and the `org_admin` role, and is renewed automatically ' +
          'before it expires. Switching organization issues a new token and clears cached data.',
      },
    },
  },
} satisfies TranslationBundle;
