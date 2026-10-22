import { implementBlock } from '@burojs/react';
import { flowMatrixBlock } from './flow-matrix-block';
import { FlowMatrixView } from './flow-matrix-view';

/** The flow matrix block's view, for `<BuroProvider blockImplementations>` (via the analytics views). */
export const flowMatrixView = implementBlock(flowMatrixBlock, { component: FlowMatrixView });
