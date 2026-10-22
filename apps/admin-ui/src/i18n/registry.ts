import {
  type LocaleGlobModule,
  type LocaleRegistry,
  createLocaleRegistry,
  localeContributionsFromGlob,
} from '@burojs/i18n-core';
import { en as frameworkEn } from '@burojs/react';

/*
 * One file per locale in each directory; adding a language is adding files,
 * never a code change here. The file name is the locale code.
 */
const chromeGlob = import.meta.glob('./locales/*.ts', {
  eager: true,
}) as Record<string, LocaleGlobModule>;
/* Large `common` parts kept in their own directory, deep-merged with the chrome. */
const segmentConditionsGlob = import.meta.glob('./segment-conditions/*.ts', {
  eager: true,
}) as Record<string, LocaleGlobModule>;
const enumGlob = import.meta.glob('./enums/*.ts', { eager: true }) as Record<
  string,
  LocaleGlobModule
>;
const resourceGlob = import.meta.glob('./resources/*.ts', {
  eager: true,
}) as Record<string, LocaleGlobModule>;

/**
 * The console's locale registry. `en` is the primary locale: its text is the
 * default declared in code (`texts`), so the `en` app bundles hold only what
 * code does not declare (glossary concepts, article titles).
 *
 * Contributions (higher priority wins on a key collision):
 *  - 0: the framework's `common` strings (`@burojs/react`'s `en`);
 *  - 10: app chrome in `common` (`./locales/*.ts`), with the segment
 *    conditions' texts merged in (`./segment-conditions/*.ts`);
 *  - 10: enum labels in `enums` (`./enums/*.ts`);
 *  - 10: per-resource docs and translations in `resources` (`./resources/*.ts`).
 */
export function buildLocaleRegistry(): LocaleRegistry {
  const registry = createLocaleRegistry({ primary: 'en' });

  registry.register({
    locale: 'en',
    namespace: 'common',
    priority: 0,
    source: '@burojs/react',
    bundle: frameworkEn,
  });

  const globs = [
    { glob: chromeGlob, source: 'app:chrome', namespace: 'common' },
    { glob: segmentConditionsGlob, source: 'app:segment-conditions', namespace: 'common' },
    { glob: enumGlob, source: 'app:enums', namespace: 'enums' },
    { glob: resourceGlob, source: 'app:resources', namespace: 'resources' },
  ] as const;
  for (const { glob, source, namespace } of globs) {
    for (const contribution of localeContributionsFromGlob(glob, {
      source,
      priority: 10,
      namespace,
    })) {
      registry.register(contribution);
    }
  }

  return registry;
}
