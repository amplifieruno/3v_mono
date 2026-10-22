import { I18nContext, useLocale } from '@burojs/react';
import * as React from 'react';

/** A block view's `t`: reads `blocks.<id>.<key>`, as a placement hands it to the view. */
export type BlockT = (key: string, options?: { readonly params?: Record<string, unknown>; readonly count?: number }) => string;

/**
 * The `t` a placement gives a block's view (`usePlacement`), for a view the dashboard draws itself
 * (gap G60): `blocks.<id>.<key>` from the app's bundles. Reading the locale re-renders the caller
 * on a language switch.
 */
export function useBlockT(id: string): BlockT {
  const i18n = React.useContext(I18nContext);
  useLocale();
  return (key, options) =>
    i18n === null
      ? key
      : i18n.t(`blocks.${id}.${key}`, {
          ...(options?.params === undefined ? {} : { params: options.params }),
          ...(options?.count === undefined ? {} : { count: options.count }),
        });
}
