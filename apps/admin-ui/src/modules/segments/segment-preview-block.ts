import { defineBlock, prop, ref } from '@burojs/core';
import { z } from 'zod';

/**
 * "Preview" in the form of a dynamic segment (`itap:segment-preview`): on request, asks the server
 * who the conditions on screen match now (`preview_segment`): how many, and the first ones by name.
 * Nothing is saved or written, so it also works before the segment exists. Says when the
 * conditions changed after the preview, and names the condition the server refused.
 */
export const segmentPreviewBlock = defineBlock('itap:segment-preview', {
  texts: {
    label: 'Preview',
    intro: 'See who these conditions match right now, before saving. Nothing is saved or changed.',
    run: 'Preview',
    rerun: 'Preview again',
    running: 'Counting…',
    empty: 'Add a condition to preview who it matches.',
    count: '{{count}} would be members now.',
    none: 'Nobody matches these conditions now.',
    first: 'First matches:',
    more: 'and {{count}} more',
    changed: 'The conditions changed since this preview: preview again to see who they match.',
    refused: 'The server refused {{where}}. Correct it and preview again.',
    failed: 'The preview could not be run. Try again.',
  },
  props: {
    target: prop(z.string().nullable().optional()).default(ref('values', 'target')),
    conditions: prop(z.unknown().optional()).default(ref('values', 'conditions')),
  },
});
