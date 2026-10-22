import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * A search's outcome and results (`itap:search-results`, exported for saved searches and bulk
 * search): the searched photo with what became of it (no face, too poor, several faces of which
 * the largest was searched, nobody found), then one card per identity found, best first, with
 * its photo, code, person, similarity and match type, each opening the identity or the profile.
 * Reads the request again while it is still running. Prop `requestId`: a request of the user's
 * own search history.
 */
export const searchResultsBlock = defineBlock('itap:search-results', {
  texts: {
    label: 'Search results',
    loading: 'Reading the search…',
    unreadable: 'The search could not be read. It may belong to another member’s history, or no longer exist.',
    pending: 'The search is still running…',
    photo_no_face: 'No face was found in the photo, so nothing was searched. Use a photo where the face is clearly visible.',
    photo_low_quality:
      'The face in the photo is too small, blurred, dark or turned away to compare, so nothing was searched. Use a sharper, frontal photo.',
    photo_invalid_image: 'The file could not be read as an image, so nothing was searched.',
    error: 'The search failed: {{detail}}',
    severalFaces: 'The photo shows {{count}} faces; the largest one was searched.',
    none: 'Nobody matched. Lower the threshold, include fuzzy matches or loosen the filters to widen the search.',
    found: '{{count}} identities found, best match first.',
    foundOne: '1 identity found.',
    meta: 'Threshold {{threshold}} · up to {{max}} results · {{duration}} ms',
    metaAttribute: 'Up to {{max}} results · {{duration}} ms',
    fuzzyIncluded: 'fuzzy matches included',
    searchedPhoto: 'The searched photo',
    rank: '#{{rank}}',
    similarity: 'Similarity {{value}}',
    noProfile: 'Unknown person',
    identityGone: 'Identity no longer exists',
    identityPhoto: 'Photo of {{code}}',
    noPhoto: 'No photo',
    openHistory: 'Open in search history',
  },
  props: {
    requestId: prop(z.string().nullable().optional()).default(null),
    /** Draws the link to the request's page (off on that page itself). */
    showHistoryLink: prop(z.boolean().optional()).default(false),
  },
});
