import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';
import { publishResultRow } from './terminal-ops';

/**
 * What "Publish policy to terminals" did (`itap:terminal-publish-result`): per terminal, by name,
 * whether the rule set was delivered and at which epoch. Without `terminals` it says what
 * publishing does (on the Terminals page); the flow's inline host keeps the answer on screen (G72).
 */
export const publishResultBlock = defineBlock('itap:terminal-publish-result', {
  texts: {
    label: 'Publish result',
    intro:
      'Publish policy to terminals pushes the current rule set (policies in force, reusable grants, active overrides) now to every access terminal of {{facility}}, whatever epoch they hold. Terminals are otherwise synced within seconds of an urgent change and within 15 minutes of any other; offline ones keep their rule set until they are back.',
    everyFacility: 'every facility (none is selected in the sidebar)',
    selectedFacility: '{{name}} (the facility selected in the sidebar)',
    nothing: 'No access terminal to publish to.',
    summary: 'Published epoch {{epoch}}: {{synced}} of {{total}} terminals synced.',
    colTerminal: 'Terminal',
    colResult: 'Result',
    colEpoch: 'Epoch',
    skipped: 'Skipped (already newer, or no longer a terminal)',
    unnamed: 'A terminal you cannot see',
  },
  props: {
    terminals: prop(z.array(publishResultRow).nullable().optional()).default(null),
    /** The facility the intro names (the sidebar's); none: every facility. */
    facilityId: prop(z.string().nullable().optional()).default(null),
  },
});
