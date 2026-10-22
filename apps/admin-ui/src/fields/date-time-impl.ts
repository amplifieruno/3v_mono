import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { DATE_TIME_FIELD } from './date-time';
import { DateTimeDisplay } from './date-time-display';
import { DateTimeInput } from './date-time-input';

/** The `itap.date-time` input and display, for `composeFieldImplementations`. */
export const dateTimeImplementations = {
  [DATE_TIME_FIELD]: fieldImplementation({
    meta: z.object({}),
    Input: DateTimeInput,
    Display: DateTimeDisplay,
  }),
};
