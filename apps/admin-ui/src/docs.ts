import { type DocBodyLoader, type DocsConfig, type DocSources, docsFromGlob } from '@burojs/core';
import { buildLocaleRegistry } from './i18n/registry';

/**
 * Hand-written articles, one directory per module:
 * `modules/<module>/docs/<topicId>.<locale>.md`. `docsFromGlob` takes the path
 * segment before `/docs/` as the scope, so the scope is the module directory
 * name; bodies load lazily (`?raw`). A file the pattern does not match is
 * skipped silently, which `tests/docs-integrity.test.ts` turns into a failure.
 */
const articleGlob = import.meta.glob('./modules/*/docs/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, DocBodyLoader>;

/** The articles that exist as files, by scope and topic. */
export const ARTICLE_FILES: DocSources = docsFromGlob(articleGlob, (topicId) =>
  topicId === 'faq' ? 'faq' : 'explanation',
);

/**
 * The glossary, in reading order. Each term's label and summary live in the
 * `common` bundle at `concepts.<term>` (`./i18n/locales/*.ts`); any doc can
 * defer to one with `doc.see: 'concept/<term>'`.
 */
export const CONCEPTS = ['organization-token'] as const;

/** The embedded documentation config handed to `<BuroProvider docs>`. */
export const docs: DocsConfig = {
  sources: ARTICLE_FILES,
  fallbackLocale: buildLocaleRegistry().primary(),
  concepts: [...CONCEPTS],
};
