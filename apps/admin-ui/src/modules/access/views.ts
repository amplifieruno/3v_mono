import { implementBlock } from '@burojs/react';
import { decisionTraceBlock } from './decision-trace-block';
import { DecisionTraceView } from './decision-trace-view';
import { policyAnalyticsBlock } from './policy-analytics-block';
import { PolicyAnalyticsView } from './policy-analytics-view';
import { simulationBlock } from './simulation-block';
import { SimulationView } from './simulation-view';
import { versionReviewBlock } from './version-review-block';
import { VersionReviewView } from './version-review-view';

/** The views of the access module's blocks (kept apart from `./index.ts`, which stays React-free). */
export const accessViews = [
  implementBlock(versionReviewBlock, { component: VersionReviewView }),
  implementBlock(simulationBlock, { component: SimulationView }),
  implementBlock(policyAnalyticsBlock, { component: PolicyAnalyticsView }),
  implementBlock(decisionTraceBlock, { component: DecisionTraceView }),
] as const;
