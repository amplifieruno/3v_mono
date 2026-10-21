import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  type AppRuntime,
  compileScreen,
  declarationLayer,
  declaredTexts,
  type ResourcePortableValue,
} from '@burojs/core';
import type { LocaleRegistry } from '@burojs/i18n-core';
import {
  type Bundle,
  type Corpus,
  type DeclaredResource,
  type ResourceLookup,
  isObject,
  mergeBundles,
} from './docs-corpus';

/**
 * The console's real corpus: per locale, the bundle's `resources` namespace;
 * for the primary locale, merged over the texts declared in code (`texts.doc`
 * on resources, fields, actions, nodes), where the bundle wins as it does at
 * render time.
 */
export function buildCorpus(app: AppRuntime, registry: LocaleRegistry): Corpus {
  const built = registry.buildResources();
  const declared = declarationLayer(declaredTexts(app)).resources ?? {};
  const corpus: Corpus = { resources: {}, concepts: {} };
  for (const locale of registry.locales()) {
    const namespaces = built[locale] ?? {};
    const bundle = (namespaces.resources ?? {}) as Bundle;
    corpus.resources[locale] =
      locale === registry.primary() ? mergeBundles(declared, bundle) : bundle;
    const concepts = namespaces.common?.concepts;
    corpus.concepts[locale] = isObject(concepts) ? concepts : {};
  }
  return corpus;
}

/** Keyed node names a resource's screens list, over show, edit and create. */
export function nodeKeysOf(value: ResourcePortableValue): Set<string> {
  const keys = new Set<string>();
  for (const mode of ['show', 'edit', 'create'] as const) {
    for (const node of compileScreen(value, mode).nodes) {
      if (node.key !== undefined) keys.add(node.key);
    }
  }
  return keys;
}

type SnapshotTarget = Parameters<
  ReturnType<AppRuntime['runtime']['getSnapshot']>['getProjection']
>[0];

/** The portable value the runtime projects for a registered resource. */
export function projectedResource(app: AppRuntime, id: string): ResourcePortableValue | undefined {
  const target = {
    kind: 'resource',
    ref: { namespace: 'default', id },
  } as SnapshotTarget;
  return app.runtime.getSnapshot().getProjection(target)?.value as
    | ResourcePortableValue
    | undefined;
}

/** The registry, read the way the checks need it. Call after `app.ready`. */
export function registryLookup(app: AppRuntime): ResourceLookup {
  return (name: string): DeclaredResource | undefined => {
    if (name.includes('/')) return undefined;
    const def = app.registry.get(name);
    if (def === undefined) return undefined;
    const fields = new Set(Object.keys(def.fields ?? {}));
    for (const item of def.types?.items ?? []) {
      for (const field of item.fields ?? []) fields.add(field.name);
    }
    const actions = new Set(
      [
        ...(def.actions?.item ?? []),
        ...(def.actions?.resource ?? []),
        ...(def.actions?.bulk ?? []),
      ].map((action) => action.name),
    );
    const projected = projectedResource(app, name);
    const nodes = projected === undefined ? new Set<string>() : nodeKeysOf(projected);
    return { fields, actions, nodes };
  };
}

/** Every `.md` file under `root`, as paths relative to it; none when `root` is absent. */
export function markdownFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md')) out.push(relative(root, path));
    }
  };
  try {
    if (statSync(root).isDirectory()) walk(root);
  } catch {
    return [];
  }
  return out.sort();
}
