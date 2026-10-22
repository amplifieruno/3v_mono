import { fieldImplementation } from '@burojs/react';
import { CUSTOM_FIELDS_FIELD } from './custom-fields';
import { CustomFieldsDisplay } from './custom-fields-display';
import { CustomFieldsInput } from './custom-fields-input';
import { customFieldsMeta } from './custom-fields-meta';

/** The `itap.custom-fields` input and display, for `composeFieldImplementations`. */
export const customFieldsImplementations = {
  [CUSTOM_FIELDS_FIELD]: fieldImplementation({
    meta: customFieldsMeta,
    Input: CustomFieldsInput,
    Display: CustomFieldsDisplay,
    layout: { size: 'full' },
  }),
};
