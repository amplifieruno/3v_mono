import { fieldImplementation } from '@burojs/react';
import { STRING_LIST_FIELD } from './string-list';
import { StringListDisplay } from './string-list-display';
import { StringListInput } from './string-list-input';
import { stringListMeta } from './string-list-meta';

/** The `itap.string-list` input and display, for `composeFieldImplementations`. */
export const stringListImplementations = {
  [STRING_LIST_FIELD]: fieldImplementation({
    meta: stringListMeta,
    Input: StringListInput,
    Display: StringListDisplay,
  }),
};
