import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * Access terminals and their policy sync (`itap:terminal-sync-status`), read from
 * `terminal_sync_status` and read again every few seconds: per terminal its state, the epoch it
 * holds against the organization's, its last sync and its error. Props narrow it to a facility
 * (`facilityId`) or a device (`deviceId`). With an override's `startedAt` (and `endedAt` once
 * ended) it says which terminals have picked up the override, or its end (plan 10 Review Focus 3).
 */
export const terminalSyncBlock = defineBlock('itap:terminal-sync-status', {
  texts: {
    label: 'Terminal sync',
    loading: 'Reading the terminals…',
    failed: 'The terminals’ sync state could not be read.',
    none: 'No access terminal here: terminals are access terminals bound to an access point as its terminal.',
    noDevice: 'This device is not bound to an access point as its terminal, so no rule set is pushed to it.',
    summaryOverview: '{{current}} of {{total}} terminals hold the current rule set (epoch {{epoch}}).',
    summaryStarted: '{{received}} of {{total}} terminals of the facility have received this override.',
    summaryEnded: '{{received}} of {{total}} terminals of the facility have received the end of this override.',
    unreachableNote: '{{count}} unreachable: they get it once they are back online (the sync retries every minute while an urgent change is pending).',
    colTerminal: 'Terminal',
    colState: 'State',
    colEpoch: 'Epoch held',
    colSynced: 'Last sync',
    colNote: 'Note',
    state_current: 'Current',
    state_behind: 'Behind',
    state_never: 'Never synced',
    state_received: 'Received',
    state_waiting: 'Not yet',
    state_unreachable: 'Unreachable',
    epochOf: '{{held}} of {{epoch}}',
    never: 'Never',
    urgentPending: 'Urgent change pending for {{seconds}} s (bound {{bound}} s)',
    outsideBound: 'Outside the revocation bound',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
    deviceId: prop(z.string().nullable().optional()).default(null),
    startedAt: prop(z.string().nullable().optional()).default(null),
    endedAt: prop(z.string().nullable().optional()).default(null),
  },
});
