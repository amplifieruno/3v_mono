import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { DETECTION_FACE_FIELD } from './detection-face';
import { DetectionFaceDisplay } from './detection-face-display';

/** The `itap.detection-face` display (no input: the column is never written). */
export const detectionFaceImplementations = {
  [DETECTION_FACE_FIELD]: fieldImplementation({
    meta: z.object({}),
    Display: DetectionFaceDisplay,
  }),
};
