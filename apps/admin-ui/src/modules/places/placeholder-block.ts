import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/** The facility tabs whose content later tasks of the places phase fill. */
export const PLACEHOLDER_TOPICS = ['access_points'] as const;

/**
 * Stands in a facility tab until its content exists (the access points):
 * one line saying what will be here.
 */
export const placesPlaceholderBlock = defineBlock('itap:places-placeholder', {
  texts: {
    label: 'Not available yet',
    access_points: 'The facility’s doors, gates and turnstiles will be listed here.',
  },
  props: {
    topic: prop(z.enum(PLACEHOLDER_TOPICS)),
  },
});
