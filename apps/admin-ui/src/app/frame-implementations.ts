import { composeFrameImplementations } from '@burojs/react';
import { currentRecordFrameView } from './current-record-frame-view';

/** The views of the app's frames, handed to `<BuroProvider frameImplementations>`. */
export const appFrameImplementations = composeFrameImplementations(currentRecordFrameView);
