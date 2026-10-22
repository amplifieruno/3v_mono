import { fieldImplementation } from '@burojs/react';
import { TIMEZONE_FIELD } from './timezone';
import { TimezoneDisplay } from './timezone-display';
import { TimezoneInput } from './timezone-input';
import { timezoneMeta } from './timezone-meta';

/** The `itap.timezone` input and display, for `composeFieldImplementations`. */
export const timezoneImplementations = {
  [TIMEZONE_FIELD]: fieldImplementation({
    meta: timezoneMeta,
    Input: TimezoneInput,
    Display: TimezoneDisplay,
  }),
};
