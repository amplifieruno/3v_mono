import { fieldImplementation } from '@burojs/react';
import { TIME_WINDOWS_FIELD } from './time-windows';
import { TimeWindowsDisplay } from './time-windows-display';
import { TimeWindowsInput } from './time-windows-input';
import { timeWindowsMeta } from './time-windows-meta';

/** The `itap.time-windows` input and display, for `composeFieldImplementations`. */
export const timeWindowsImplementations = {
  [TIME_WINDOWS_FIELD]: fieldImplementation({
    meta: timeWindowsMeta,
    Input: TimeWindowsInput,
    Display: TimeWindowsDisplay,
    layout: { size: 'full' },
  }),
};
