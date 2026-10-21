import { type I18nFacade, type LocaleRegistry, createI18nFromRegistry } from '@burojs/i18n-core';
import { loadLocale } from '@burojs/ui-shadcn';

/**
 * The storage key of the chosen locale, shared by the shell's language control
 * (`<BuroProvider languageStorageKey>`) and {@link createI18n}.
 */
export const LANGUAGE_STORAGE_KEY = 'itap:language';

/**
 * The boot locale: the stored choice when the registry can render it, the
 * primary locale otherwise. `stored` is untrusted (storage outlives deploys).
 */
export function initialLocale(registry: LocaleRegistry, stored: string | undefined): string {
  return stored !== undefined && registry.locales().includes(stored) ? stored : registry.primary();
}

/**
 * The shell's i18n facade over the registry the caller built (one registry
 * instance per app, shared with the language switcher). Every locale falls
 * back to the registry's primary.
 */
export function createI18n(
  registry: LocaleRegistry,
  stored: string | undefined = loadLocale(LANGUAGE_STORAGE_KEY),
): Promise<I18nFacade> {
  return createI18nFromRegistry(registry, {
    defaultLocale: initialLocale(registry, stored),
    warnOnMissing: false,
  });
}
