import type { DocBodyLoader, DocsConfig, DocSources, DocTopicKind } from '@burojs/core';
import { buildLocaleRegistry } from './i18n/registry';

/** Where one article file sits: its owning module, the doc scope it documents, topic and locale. */
export interface ArticlePath {
  readonly module: string;
  readonly scope: string;
  readonly topicId: string;
  readonly locale: string;
}

const ARTICLE_PATH = /(?:^|\/)([^/]+)\/docs\/([^/]+)\/([^/]+)\.([a-z]{2}(?:-[A-Z]{2})?)\.md$/u;

/**
 * Reads an article path, `…/<module>/docs/<scope>/<topicId>.<locale>.md`: the
 * article lives in the module that owns it, and the folder under `docs/` is
 * the doc scope (a registered resource such as `organization_member`), so a
 * module documents each of its resources without a folder of its own per
 * resource. `null` for any other shape.
 */
export function parseArticlePath(path: string): ArticlePath | null {
  const match = ARTICLE_PATH.exec(path);
  if (match === null) return null;
  const [, module = '', scope = '', topicId = '', locale = ''] = match;
  return { module, scope, topicId, locale };
}

/** The doc sources of article files, by scope and topic; a path {@link parseArticlePath} refuses is left out. */
export function articleSources(
  glob: Readonly<Record<string, DocBodyLoader>>,
  kindOf: (topicId: string) => DocTopicKind,
): DocSources {
  const out: DocSources = {};
  for (const [path, load] of Object.entries(glob)) {
    const article = parseArticlePath(path);
    if (article === null) continue;
    const byTopic = (out[article.scope] ??= {});
    const topic = (byTopic[article.topicId] ??= { kind: kindOf(article.topicId), bodies: {} });
    topic.bodies[article.locale] = load;
  }
  return out;
}

/**
 * Hand-written articles inside their module (`modules/<module>/docs/<scope>/<topicId>.<locale>.md`);
 * bodies load lazily (`?raw`). A file of any other shape is left out, which
 * `tests/docs-integrity.test.ts` turns into a failure.
 */
const articleGlob = import.meta.glob('./modules/**/*.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, DocBodyLoader>;

/** The articles that exist as files, by scope and topic. */
export const ARTICLE_FILES: DocSources = articleSources(articleGlob, (topicId) =>
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
