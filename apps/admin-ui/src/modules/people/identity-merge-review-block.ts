import { defineBlock, prop, ref } from '@burojs/core';
import { z } from 'zod';

/**
 * The identities of a merge side by side (`itap:identity-merge-review`): each one's photo,
 * status, profile and what it holds (photos, face templates, watch-list entries, open duplicate
 * pairs, pending verifications), the kept identity marked, what the merge moves and closes, and
 * why the database would refuse it. Placed in "Merge into this identity" (a target and the
 * chosen sources), in "Merge identities" on a duplicate pair (the pair and the kept side), and
 * on a pair's page (comparison only).
 */
export const identityMergeReviewBlock = defineBlock('itap:identity-merge-review', {
  texts: {
    label: 'Merge review',
    loading: 'Reading the identities…',
    missing: 'One of the identities can no longer be read.',
    choose: 'Choose the identities to merge into {{code}}.',
    kept: 'Kept',
    mergedAway: 'Merged into the kept identity',
    field: 'Identity',
    row_photo: 'Photo',
    row_status: 'Status',
    row_profile: 'Profile',
    row_photos: 'Photos',
    row_templates: 'Face templates',
    row_watch_list_entries: 'Watch-list entries',
    row_open_pairs: 'Open duplicate pairs',
    row_pending_verifications: 'Pending verifications',
    noProfile: 'Unknown person',
    moves:
      '{{photos}} photos, {{templates}} face templates and {{entries}} watch-list entries move to {{target}}. {{sources}} will be marked merged: frozen with their history, left out of matching and unlinked from any profile.',
    inherits: '{{target}} takes over the profile {{profile}}.',
    inheritsPrimary: '{{target}} becomes the primary identity of {{profile}}, as {{source}} was.',
    closes:
      'Their open duplicate pairs ({{pairs}}) close as merged and their pending verification requests ({{verifications}}) are cancelled.',
    rollback:
      'The merge can be rolled back from People → Identity merges: everything that moved goes back, except that cancelled verification requests stay cancelled.',
    problem_merged: '{{code}} is already merged into another identity: it cannot be merged again.',
    problem_profiles:
      'The identities are linked to different profiles: the merge would be refused. Unlink one of them first, or merge the two profiles if they are the same person.',
    problem_synthetic: 'A synthetic test identity cannot be merged with a real one.',
    problem_restricted: 'Processing of the person linked to {{code}} is restricted: lift the restriction before merging.',
  },
  props: {
    // A target and the chosen sources ("Merge into this identity"); the form's sources by default.
    targetId: prop(z.string().nullable().optional()).default(null),
    sourceIds: prop(z.array(z.string()).nullable().optional()).default(ref('values', 'source_ids')),
    // A duplicate pair and the kept side ("Merge identities" on the pair, or its page with no side).
    first: prop(z.string().nullable().optional()).default(null),
    second: prop(z.string().nullable().optional()).default(null),
    keep: prop(z.string().nullable().optional()).default(ref('values', 'keep')),
  },
});
