import { implementBlock } from '@burojs/react';
import { clientKeySecretBlock } from './key-secret-block';
import { ClientKeySecretView } from './key-secret-view';

/** The views of the face authentication module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const faceAuthViews = [implementBlock(clientKeySecretBlock, { component: ClientKeySecretView })] as const;
