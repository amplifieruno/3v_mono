import type { BlockViewProps } from '@burojs/react';
import { useLinkComponent } from '@burojs/ui-shadcn';
import { CircleAlert, CircleCheck } from 'lucide-react';
import type * as React from 'react';
import { PhotoThumb } from '../../fields/photo-thumb';
import type { enrollmentResultBlock } from './enrollment-result-block';
import { rejectReasonText } from './enrollment-refusals';

/** The enrollment action's answer (`itap:enrollment-result`): the summary, then each refused photo. */
export function EnrollmentResultView({ props, t }: BlockViewProps<typeof enrollmentResultBlock>): React.ReactElement {
  const { identityId, identityCode: code, photosAdded, templates, rejected } = props;
  const Link = useLinkComponent();
  const order = props.photoIds.map((id) => id.toLowerCase());
  const total = photosAdded + rejected.length;
  return (
    <div data-testid="enrollment-result" className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        {rejected.length === 0 ? (
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        )}
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">
            {photosAdded > 0
              ? t('added', { params: { count: photosAdded, total, code } })
              : t('noneAdded', { params: { code } })}
          </p>
          <p className="text-muted-foreground">{t('templates', { params: { count: templates } })}</p>
          <Link href={`/identities/${identityId}`} className="text-primary underline-offset-4 hover:underline">
            {t('open', { params: { code } })}
          </Link>
        </div>
      </div>
      {rejected.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('allAccepted')}</p>
      ) : (
        <section aria-label={t('rejectedTitle')} className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-700 dark:bg-amber-950/30">
          <h3 className="text-sm font-medium">{t('rejectedTitle')}</h3>
          <p className="text-xs text-muted-foreground">{t('rejectedIntro')}</p>
          <ul className="flex flex-col gap-2">
            {rejected.map((photo, position) => {
              // The photo's number in the form; the answer's order when the form's list is unknown.
              const at = order.indexOf(photo.file_id.toLowerCase());
              const index = at >= 0 ? at + 1 : position + 1;
              return (
                <li key={photo.file_id} data-testid="enrollment-rejected" className="flex items-center gap-3 text-sm">
                  <PhotoThumb fileId={photo.file_id} alt={t('rejectedPhoto', { params: { index } })} className="size-14" />
                  <span>{t('reason', { params: { index, reason: rejectReasonText(photo.reason) } })}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
