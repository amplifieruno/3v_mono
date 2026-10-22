import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/** The most devices needing attention the summary lists. */
export const DEVICE_PROBLEMS_MAX = 20;

/**
 * The health of the devices in service (`itap:device-health-summary`, `devices`): how many are
 * healthy, warning, offline or never checked, as one bar, and the devices needing attention
 * (offline or in connection error first, then marked faulty, then warning), each a link. Props
 * `facilityId` (`null` = every facility) and `limit` (devices listed). Retired devices are left out.
 */
export const deviceHealthSummaryBlock = defineBlock('itap:device-health-summary', {
  texts: {
    label: 'Device health',
    loading: 'Reading the devices…',
    failed: 'The devices could not be read.',
    none: 'No device in service.',
    inService: '{{count}} devices in service',
    healthChart: 'Devices in service by health at the last check',
    attention: 'Needing attention',
    allWell: 'Every device answered its last check.',
    lastSeen: 'last seen {{time}}',
    neverSeen: 'never seen',
    more: 'And {{count}} more.',
    everywhere: 'No facility',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
    limit: prop(z.number().int().min(1).max(DEVICE_PROBLEMS_MAX)).default(5),
  },
});
