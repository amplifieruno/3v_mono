import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

const count = () => prop(z.number().nullable().optional()).default(null);

/**
 * "Evaluate now" in its dialog (`itap:segment-evaluation`). Before the run (no result props, the
 * flow's review) it says what an evaluation does; once the server answered (`then.open`) it says
 * how many joined and left by rule and the member count now, or that a newer evaluation had
 * already run (stale), so this one changed nothing. Members added by hand are never removed.
 */
export const segmentEvaluationBlock = defineBlock('itap:segment-evaluation', {
  texts: {
    label: 'Evaluation',
    intro:
      'The conditions are applied now instead of at the next hourly run: whoever matches joins, and members by rule who no longer match leave.',
    done: 'Evaluated: {{added}} joined and {{removed}} left by rule.',
    unchanged: 'Evaluated: nobody joined or left.',
    members: 'The segment has {{count}} members now.',
    stale: 'A newer evaluation had already run, so this one changed nothing. The segment has {{count}} members.',
    manual: 'Members added by hand stay whatever the conditions say.',
  },
  props: {
    added: count(),
    removed: count(),
    memberCount: count(),
    stale: prop(z.boolean().nullable().optional()).default(null),
  },
});
