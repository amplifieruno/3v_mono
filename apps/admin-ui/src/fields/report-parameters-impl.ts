import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { REPORT_PARAMETERS_FIELD } from './report-parameters';
import { ReportParametersDisplay } from './report-parameters-display';
import { ReportParametersInput } from './report-parameters-input';

/** The `itap.report-parameters` input and display, for `composeFieldImplementations`. */
export const reportParametersImplementations = {
  [REPORT_PARAMETERS_FIELD]: fieldImplementation({
    meta: z.object({}),
    Input: ReportParametersInput,
    Display: ReportParametersDisplay,
  }),
};
