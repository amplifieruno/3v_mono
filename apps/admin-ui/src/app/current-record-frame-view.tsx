import { implementFrame } from '@burojs/react';
import { FormActions, RecordActions } from '@burojs/ui-shadcn';
import { currentRecordFrame } from './current-record-frame';

/**
 * `itap:current-record`'s view: the built-in record frame without `<RecordTitle/>` and
 * `<CopyId/>`. The header region (item actions, `header` slot) is drawn in show mode, or
 * whenever the screen fills the `header` slot, so an edit or create form opens directly.
 */
export const currentRecordFrameView = implementFrame(currentRecordFrame, {
  component: ({ slots, mode }) => (
    <>
      {mode === 'show' || slots.header !== null ? (
        <div data-buro-region="record-header" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <RecordActions />
          </div>
          {slots.header}
        </div>
      ) : null}
      {slots.body}
      <FormActions />
    </>
  ),
});
