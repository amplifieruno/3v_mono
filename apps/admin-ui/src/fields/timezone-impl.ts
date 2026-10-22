import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { TIMEZONE_FIELD } from './timezone';
import { TimezoneDisplay } from './timezone-display';
import { TimezoneInput } from './timezone-input';

/** The `itap.timezone` input and display, for `composeFieldImplementations`. */
export const timezoneImplementations = {
  [TIMEZONE_FIELD]: fieldImplementation({
    meta: z.object({}),
    Input: TimezoneInput,
    Display: TimezoneDisplay,
  }),
};
