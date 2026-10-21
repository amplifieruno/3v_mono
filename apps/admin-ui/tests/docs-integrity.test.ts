import { join } from 'node:path';
import { type DocSources, defineAppDefinition, defineResource } from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app/app-definition';
import { CONCEPTS, docs } from '../src/docs';
import { buildLocaleRegistry } from '../src/i18n/registry';
import { buildCorpus, markdownFiles, registryLookup } from './support/app-corpus';
import {
  type Corpus,
  type ResourceLookup,
  conceptsWithoutSummary,
  emptyDocs,
  orphanAddresses,
  orphanArticleScopes,
  summariesEchoingLabels,
  unlistedSeeTargets,
  unreachableArticles,
  untitledArticles,
} from './support/docs-corpus';

/**
 * The documentation corpus checked against the application: a doc that names
 * something the registry does not declare, an empty doc, a summary that only
 * restates its label, an article file nothing reaches, a `doc.see` to an
 * unlisted glossary term and a listed term without a summary all fail here.
 *
 * Each check runs over the real console (no finding expected) and over a
 * fixture carrying exactly its defect (the finding expected), so none of them
 * can pass by looking at nothing while the corpus is still small.
 */

const MODULES_ROOT = join(import.meta.dirname, '../src/modules');

describe('documentation corpus of the console', () => {
  let corpus: Corpus;
  let lookup: ResourceLookup;

  beforeAll(async () => {
    await app.ready;
    corpus = buildCorpus(app, buildLocaleRegistry());
    lookup = registryLookup(app);
  });

  it('should document only registered resources, fields, actions and nodes', () => {
    expect(orphanAddresses(corpus, lookup)).toEqual([]);
  });

  it('should have no empty doc block', () => {
    expect(emptyDocs(corpus)).toEqual([]);
  });

  it('should have no summary that restates its label', () => {
    expect(summariesEchoingLabels(corpus)).toEqual([]);
  });

  it('should reach every .md file under src/modules through docs.sources', () => {
    expect(unreachableArticles(markdownFiles(MODULES_ROOT), docs.sources)).toEqual([]);
  });

  it('should scope every article to a registered resource', () => {
    expect(orphanArticleScopes(docs.sources, lookup)).toEqual([]);
  });

  it('should title every article in every locale', () => {
    expect(untitledArticles(corpus, docs.sources)).toEqual([]);
  });

  it('should defer only to listed glossary terms', () => {
    expect(unlistedSeeTargets(corpus, CONCEPTS)).toEqual([]);
  });

  it('should list a non-empty glossary and write every term in every locale', () => {
    expect(docs.concepts).toEqual([...CONCEPTS]);
    expect(CONCEPTS.length).toBeGreaterThan(0);
    expect(conceptsWithoutSummary(corpus, CONCEPTS)).toEqual([]);
  });

  it('should set a fallback locale so a one-locale article never vanishes', () => {
    expect(docs.fallbackLocale).toBe('en');
  });
});

describe('the checks find each defect', () => {
  const declared: ResourceLookup = (name) =>
    name === 'profiles'
      ? {
          fields: new Set(['status']),
          actions: new Set(['merge']),
          nodes: new Set(['consent']),
        }
      : undefined;
  const corpusOf = (resources: Record<string, unknown>, concepts = {}): Corpus => ({
    resources: { en: resources },
    concepts: { en: concepts },
  });
  const sources: DocSources = {
    profiles: {
      lifecycle: {
        kind: 'explanation',
        bodies: { en: async () => '# Lifecycle' },
      },
    },
  };

  it('should find an undeclared resource, field, action or node', () => {
    const corpus = corpusOf({
      gone: { doc: { summary: 'Was removed.' } },
      profiles: {
        fields: {
          status: { doc: { summary: 'Who set it.' } },
          old: { doc: { summary: 'x' } },
        },
        actions: { split: { doc: { summary: 'Splits.' } } },
        nodes: { audit: { doc: { summary: 'History.' } } },
      },
    });
    expect(orphanAddresses(corpus, declared)).toEqual([
      'en: gone (not registered)',
      'en: profiles.actions.split (not declared)',
      'en: profiles.fields.old (not declared)',
      'en: profiles.nodes.audit (not declared)',
    ]);
  });

  it('should find an empty doc block', () => {
    const corpus = corpusOf({ profiles: { fields: { status: { doc: {} } } } });
    expect(emptyDocs(corpus)).toEqual(['en: profiles.fields.status']);
  });

  it('should find a summary equal to its label', () => {
    const corpus = corpusOf({
      profiles: {
        fields: {
          status: { label: 'Status', doc: { summary: 'The status.' } },
        },
      },
    });
    expect(summariesEchoingLabels(corpus)).toEqual(['en: profiles.fields.status']);
  });

  it('should find a .md file not reachable from docs.sources', () => {
    const files = [
      'people/docs/profiles/lifecycle.en.md',
      'people/docs/profiles/merge.en.md',
      'people/docs/lifecycle.en.md',
      'people/x.md',
    ];
    expect(unreachableArticles(files, sources)).toEqual([
      'people/docs/profiles/merge.en.md',
      'people/docs/lifecycle.en.md (not <module>/docs/<scope>/<topic>.<locale>.md)',
      'people/x.md (not <module>/docs/<scope>/<topic>.<locale>.md)',
    ]);
  });

  it('should find an article scope that names no resource, and an untitled article', () => {
    expect(orphanArticleScopes({ ...sources, places: {} }, declared)).toEqual(['places']);
    expect(untitledArticles(corpusOf({}), sources)).toEqual(['en: profiles -> lifecycle']);
    const titled = corpusOf({
      profiles: { doc: { topics: { lifecycle: 'Lifecycle' } } },
    });
    expect(untitledArticles(titled, sources)).toEqual([]);
  });

  it('should find a doc.see naming an unlisted concept', () => {
    const corpus = corpusOf({
      profiles: { fields: { status: { doc: { see: 'concept/legal-hold' } } } },
    });
    expect(unlistedSeeTargets(corpus, ['organization-token'])).toEqual([
      'en: profiles.fields.status -> concept/legal-hold',
    ]);
  });

  it('should find a listed concept without a summary or label', () => {
    const corpus = corpusOf({}, { 'legal-hold': { label: 'Legal hold', doc: {} } });
    expect(conceptsWithoutSummary(corpus, ['legal-hold', 'epoch'])).toEqual([
      'en: concepts.legal-hold.doc.summary',
      'en: concepts.epoch.doc.summary',
      'en: concepts.epoch.label',
    ]);
  });
});

describe('the registry lookup reads a real runtime', () => {
  it('should see declared fields and keyed nodes, and not others', async () => {
    const probe = defineResource('docs_probe', {
      fields: { note: { type: 'string' }, memo: { type: 'string' } },
      views: {
        show: {
          body: (l) => [
            l.panel(['note', 'memo'], { key: 'audit' }),
            l.panel([], { key: 'nowhere', in: [] }),
          ],
        },
      },
    });
    const runtime = defineAppDefinition({ name: 'docs-probe' }, ({ use }) => {
      use('docs-probe', probe);
    }).createRuntime();
    await runtime.ready;
    const declared = registryLookup(runtime)('docs_probe');
    expect(declared?.fields).toEqual(new Set(['note', 'memo']));
    expect(declared?.nodes.has('audit')).toBe(true);
    expect(declared?.nodes.has('nowhere')).toBe(false);
    expect(registryLookup(runtime)('missing')).toBeUndefined();
  });
});
