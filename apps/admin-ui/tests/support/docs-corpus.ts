import type { DocSources } from '@burojs/core';
import { parseArticlePath } from '../../src/docs';

/**
 * The documentation corpus as plain data, and the integrity checks over it.
 *
 * Pure on purpose: `../docs-integrity.test.ts` runs every check twice, once
 * over the real console (expecting no finding) and once over a fixture that
 * carries exactly the defect the check exists for (expecting it to be found),
 * so a check cannot pass by looking at nothing.
 */

export type Bundle = Record<string, unknown>;

/** Per locale: the merged `resources` namespace and the `common.concepts` block. */
export interface Corpus {
  resources: Record<string, Bundle>;
  concepts: Record<string, Bundle>;
}

/** What the registry declares for one resource, as the checks need it. */
export interface DeclaredResource {
  fields: ReadonlySet<string>;
  actions: ReadonlySet<string>;
  nodes: ReadonlySet<string>;
}

/** The registry, as the checks need it: a resource by name, or `undefined`. */
export type ResourceLookup = (name: string) => DeclaredResource | undefined;

export interface DocumentedAddress {
  locale: string;
  resource: string;
  section?: 'fields' | 'actions' | 'nodes';
  key?: string;
  /** The entry the `doc` block sits in (carries `label`/`title` beside it). */
  entry: Bundle;
  doc: unknown;
  where: string;
}

const SECTIONS = ['fields', 'actions', 'nodes'] as const;

/** `resources._` is the framework's per-resource fallback, not a resource. */
const RESOURCE_FALLBACK_KEY = '_';

export function isObject(value: unknown): value is Bundle {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep merge where `over` wins leaf by leaf (a bundle over the declaration layer). */
export function mergeBundles(base: Bundle, over: Bundle): Bundle {
  const out: Bundle = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const prev = out[key];
    out[key] = isObject(prev) && isObject(value) ? mergeBundles(prev, value) : value;
  }
  return out;
}

/** Every `doc` block in the `resources` namespace, with the address it claims. */
export function documentedAddresses(corpus: Corpus): DocumentedAddress[] {
  const out: DocumentedAddress[] = [];
  for (const [locale, bundle] of Object.entries(corpus.resources)) {
    for (const [resource, entry] of Object.entries(bundle)) {
      if (!isObject(entry) || resource === RESOURCE_FALLBACK_KEY) continue;
      if (entry.doc !== undefined) {
        out.push({
          locale,
          resource,
          entry,
          doc: entry.doc,
          where: `${locale}: ${resource}`,
        });
      }
      for (const section of SECTIONS) {
        const group = entry[section];
        if (!isObject(group)) continue;
        for (const [key, child] of Object.entries(group)) {
          if (!isObject(child) || child.doc === undefined) continue;
          out.push({
            locale,
            resource,
            section,
            key,
            entry: child,
            doc: child.doc,
            where: `${locale}: ${resource}.${section}.${key}`,
          });
        }
      }
    }
  }
  return out;
}

/** A documented resource, field, action or node the registry does not declare. */
export function orphanAddresses(corpus: Corpus, lookup: ResourceLookup): string[] {
  const out = new Set<string>();
  for (const site of documentedAddresses(corpus)) {
    const declared = lookup(site.resource);
    if (declared === undefined) {
      out.add(`${site.locale}: ${site.resource} (not registered)`);
      continue;
    }
    if (site.section !== undefined && !declared[site.section].has(site.key ?? '')) {
      out.add(`${site.where} (not declared)`);
    }
  }
  return [...out].sort();
}

/** A `doc` block with nothing in it: it reads as documented and renders nothing. */
export function emptyDocs(corpus: Corpus): string[] {
  return documentedAddresses(corpus)
    .filter(({ doc }) => {
      if (!isObject(doc)) return true;
      const summary = typeof doc.summary === 'string' ? doc.summary.trim() : '';
      const links = Array.isArray(doc.links) ? doc.links : [];
      return summary === '' && links.length === 0 && doc.see === undefined;
    })
    .map((site) => site.where);
}

function normalize(text: string): string {
  return text
    .toLocaleLowerCase('en')
    .replace(/^(the|a|an)\s+/u, '')
    .replace(/[.,;:!?—–-]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** A summary that only restates the label (or a node's title) it sits beside. */
export function summariesEchoingLabels(corpus: Corpus): string[] {
  const out: string[] = [];
  for (const site of documentedAddresses(corpus)) {
    if (!isObject(site.doc) || typeof site.doc.summary !== 'string') continue;
    const captions = [site.entry.label, site.entry.labelPlural, site.entry.title].filter(
      (value): value is string => typeof value === 'string',
    );
    const summary = normalize(site.doc.summary);
    if (captions.some((caption) => normalize(caption) === summary)) out.push(site.where);
  }
  return out;
}

/** A `doc.see` naming a term the glossary (`DocsConfig.concepts`) does not list. */
export function unlistedSeeTargets(corpus: Corpus, concepts: readonly string[]): string[] {
  const listed = new Set(concepts.map((term) => `concept/${term}`));
  const out: string[] = [];
  for (const site of documentedAddresses(corpus)) {
    if (!isObject(site.doc) || typeof site.doc.see !== 'string') continue;
    if (!listed.has(site.doc.see)) out.push(`${site.where} -> ${site.doc.see}`);
  }
  return out;
}

/** A listed glossary term without a label and a summary in some locale. */
export function conceptsWithoutSummary(corpus: Corpus, concepts: readonly string[]): string[] {
  const out: string[] = [];
  for (const [locale, block] of Object.entries(corpus.concepts)) {
    for (const term of concepts) {
      const entry = block[term];
      const doc = isObject(entry) ? entry.doc : undefined;
      const summary = isObject(doc) ? doc.summary : undefined;
      if (typeof summary !== 'string' || summary.trim() === '') {
        out.push(`${locale}: concepts.${term}.doc.summary`);
      }
      if (!isObject(entry) || typeof entry.label !== 'string') {
        out.push(`${locale}: concepts.${term}.label`);
      }
    }
  }
  return out;
}

/** An article scope that is neither a registered resource nor a reserved prefixed scope. */
export function orphanArticleScopes(sources: DocSources, lookup: ResourceLookup): string[] {
  return Object.keys(sources)
    .filter((scope) => !scope.includes('/'))
    .filter((scope) => lookup(scope) === undefined);
}

/**
 * A `.md` file (path relative to `src/modules`) that the docs map does not
 * reach: not shaped `<module>/docs/<scope>/<topic>.<locale>.md`, or absent
 * from `sources` under that scope, topic and locale.
 */
export function unreachableArticles(files: readonly string[], sources: DocSources): string[] {
  const out: string[] = [];
  for (const file of files) {
    const article = file.split('/').length === 4 ? parseArticlePath(file) : null;
    if (article === null) {
      out.push(`${file} (not <module>/docs/<scope>/<topic>.<locale>.md)`);
      continue;
    }
    if (sources[article.scope]?.[article.topicId]?.bodies[article.locale] === undefined) out.push(file);
  }
  return out;
}

/** An article without a title (`resources.<scope>.doc.topics.<id>`) in some locale. */
export function untitledArticles(corpus: Corpus, sources: DocSources): string[] {
  const out: string[] = [];
  for (const [scope, topics] of Object.entries(sources)) {
    for (const topicId of Object.keys(topics)) {
      for (const [locale, bundle] of Object.entries(corpus.resources)) {
        const title = [scope, RESOURCE_FALLBACK_KEY]
          .map((key) => bundle[key])
          .map((entry) => (isObject(entry) ? entry.doc : undefined))
          .map((doc) => (isObject(doc) ? doc.topics : undefined))
          .map((byId) => (isObject(byId) ? byId[topicId] : undefined))
          .find((value) => typeof value === 'string');
        if (title === undefined) out.push(`${locale}: ${scope} -> ${topicId}`);
      }
    }
  }
  return out;
}
