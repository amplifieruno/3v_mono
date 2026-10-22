import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * The operator workspace's occupancy clock (`itap:occupancy-updated`): reads the workspace's
 * occupancy figures (`itap:workspace-occupancy-facts`) again every 15 seconds and says when they
 * were last read. The built-in facts block above it shows the same query from the same cache, so
 * it refreshes with it (the facts block itself cannot poll, buro gap G47). Prop `facilityId`.
 */
export const occupancyUpdatedBlock = defineBlock('itap:occupancy-updated', {
  texts: {
    label: 'Occupancy updated',
    updated: 'Updated {{time}}; read again every 15 seconds.',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
  },
});
