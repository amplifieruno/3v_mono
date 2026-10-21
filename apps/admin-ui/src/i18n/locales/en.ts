import type { TranslationBundle } from '@burojs/i18n-core';

/**
 * App chrome in the `common` namespace (English, primary). Labels declared in
 * code (`texts`) are not repeated here; this bundle holds what code does not
 * declare: the glossary.
 */
export default {
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
