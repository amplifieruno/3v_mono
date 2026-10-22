import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { WORKSPACE_PANELS_FIELD } from './workspace-panels';
import { WorkspacePanelsDisplay } from './workspace-panels-display';
import { WorkspacePanelsInput } from './workspace-panels-input';

/** The `itap.workspace-panels` input and display, for `composeFieldImplementations`. */
export const workspacePanelsImplementations = {
  [WORKSPACE_PANELS_FIELD]: fieldImplementation({
    meta: z.object({}),
    Input: WorkspacePanelsInput,
    Display: WorkspacePanelsDisplay,
  }),
};
