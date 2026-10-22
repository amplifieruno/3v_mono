import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/**
 * What rolling a merge back restores (`itap:merge-rollback-review`): the kept identity, each
 * merged identity with the status and profile link it gets back, what leaves the kept identity
 * and the duplicate pairs that reopen; it warns when the kept identity was merged away later (the
 * rollback would be refused). Placed in "Roll back" on an identity merge and on the
 * merge's page.
 */
export const mergeRollbackReviewBlock = defineBlock('itap:merge-rollback-review', {
  texts: {
    label: 'Rollback review',
    loading: 'Reading the merge…',
    missing: 'The merge can no longer be read.',
    identity: 'Identity',
    now: 'Now',
    restored: 'Restored status',
    profile: 'Restored profile',
    noProfile: 'Unknown person',
    primary: 'primary identity',
    kept: '{{target}} keeps its own photos and templates, and the ones added after the merge.',
    back:
      'The photos, face templates, watch-list entries and segment memberships each merged identity brought go back to it from {{target}}.',
    inherited: '{{target}} gives up the profile {{profile}} it took over in the merge.',
    inheritedPrimary: '{{target}} stops being the primary identity of its profile.',
    pairs: '{{count}} duplicate pairs the merge closed reopen.',
    cancelled: 'Verification requests the merge cancelled stay cancelled.',
    done: 'This merge was rolled back.',
    targetMerged:
      '{{target}} was itself merged into another identity later: merges are undone newest first, so this rollback would be refused. Roll back that later merge first (Merges tab of {{target}}).',
  },
  props: {
    mergeId: prop(z.string().nullable().optional()).default(null),
  },
});
