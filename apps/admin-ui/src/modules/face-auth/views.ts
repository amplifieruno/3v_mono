import { implementBlock } from '@burojs/react';
import { authDecisionBlock } from './decision-block';
import { AuthDecisionView } from './decision-view';
import { clientKeySecretBlock } from './key-secret-block';
import { ClientKeySecretView } from './key-secret-view';
import { authTesterBlock } from './tester';
import { AuthTesterView } from './tester-view';

/** The views of the face authentication module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const faceAuthViews = [
  implementBlock(clientKeySecretBlock, { component: ClientKeySecretView }),
  implementBlock(authDecisionBlock, { component: AuthDecisionView }),
  implementBlock(authTesterBlock, { component: AuthTesterView }),
] as const;
