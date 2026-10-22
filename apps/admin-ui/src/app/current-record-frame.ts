import { defineFrame, slot } from '@burojs/core';

/**
 * The record frame of a current-record page (the organization, its settings, my
 * preferences): the record the page shows is fixed by the session, so the page's own
 * heading names it and the frame draws no record title or copyable id. Show mode keeps
 * the item actions (Edit) and the `header` slot; edit and create keep the form actions.
 * Its view is `./current-record-frame-view.tsx` (`tasks/ui/buro-gaps.md` G16).
 */
export const currentRecordFrame = defineFrame('itap:current-record', {
  for: 'record',
  slots: { header: slot().optional(), body: slot() },
});
