import { enumValueText, resolveEnumLabel } from '@burojs/core';
import { useApp, useI18nCaps } from '@burojs/react';
import { humanize } from './chart-scale';

/**
 * An enum value's label as text, translated the way `<EnumBadge>` translates it (the enum's bundle
 * namespace, then its declared label, then the humanized value), for places that need a string:
 * SVG hover titles, accessible names and data tables (buro has no such hook, G59).
 */
export function useEnumLabel(enumName: string): (value: string) => string {
  const app = useApp();
  const caps = useI18nCaps();
  const def = app.registry.enums.get(enumName);
  const namespace = (def as { readonly i18nNamespace?: string } | undefined)?.i18nNamespace ?? enumName;
  return (value) => resolveEnumLabel(caps, namespace, value, enumValueText(def, value) ?? humanize(value));
}
