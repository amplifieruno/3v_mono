import { resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp, useCustomQuery } from '@burojs/react';
import { Button, useLinkComponent } from '@burojs/ui-shadcn';
import { Eye } from 'lucide-react';
import * as React from 'react';
import { IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { type PreviewInput, type PreviewResult, previewSegment } from './segment-evaluation-ops';
import type { segmentPreviewBlock } from './segment-preview-block';
import { previewRefusal, previewSnapshot, sameSnapshot, unnamedMatches } from './segment-preview-format';

type Props = BlockViewProps<typeof segmentPreviewBlock>;
type T = Props['t'];

/** Asked before any preview: never sent (the query is disabled until the button is used). */
const NOTHING_ASKED: PreviewInput = { target: 'profiles', conditions: {} };

/** The count and the first matches, each opening its profile or identity. */
function PreviewMatches({ asked, result, t }: { readonly asked: PreviewInput; readonly result: PreviewResult; readonly t: T }) {
  const app = useApp();
  const Link = useLinkComponent();
  if (result.count === 0) return <p className="text-sm font-medium">{t('none')}</p>;
  const resource = asked.target === 'profiles' ? PROFILE_RESOURCE : IDENTITY_RESOURCE;
  const def = app.registry.get(resource);
  const more = unnamedMatches(result.count, result.sample_ids.length);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="font-medium" data-testid="segment-preview-count">
        {t('count', { params: { count: result.count } })}
      </p>
      <p className="text-muted-foreground">{t('first')}</p>
      <ul className="flex flex-wrap gap-x-3 gap-y-1" data-testid="segment-preview-sample">
        {result.sample_ids.map((id, index) => (
          <li key={id}>
            <Link href={resourceShowHref(app.registry, def, resource, id)} className="text-primary underline-offset-4 hover:underline">
              {result.sample_labels[index] ?? id}
            </Link>
          </li>
        ))}
        {more > 0 ? <li className="text-muted-foreground">{t('more', { params: { count: more } })}</li> : null}
      </ul>
    </div>
  );
}

/**
 * The preview of a dynamic segment's form (`itap:segment-preview`): runs on "Preview" only, with
 * the target and conditions on screen at that moment, and keeps that answer until asked again.
 */
export function SegmentPreviewView({ props, t }: Props): React.ReactElement {
  const current = previewSnapshot(props.target, props.conditions);
  const [asked, setAsked] = React.useState<PreviewInput | null>(null);
  const preview = useCustomQuery(previewSegment, asked ?? NOTHING_ASKED, { enabled: asked !== null });
  const run = () => {
    if (current === null) return;
    if (sameSnapshot(asked, current)) void preview.refetch();
    else setAsked(current);
  };

  let body: React.ReactNode = null;
  if (asked !== null) {
    if (preview.isFetching) body = <p className="text-sm text-muted-foreground">{t('running')}</p>;
    else if (preview.isError) {
      const where = previewRefusal(preview.error, asked.conditions);
      body = (
        <p role="alert" className="text-sm text-destructive">
          {where === null ? t('failed') : t('refused', { params: { where } })}
        </p>
      );
    } else if (preview.data !== undefined) body = <PreviewMatches asked={asked} result={preview.data} t={t} />;
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-3" data-testid="segment-preview" aria-label={t('label')} aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={current === null || preview.isFetching} onClick={run}>
          <Eye className="size-4" aria-hidden />
          {asked === null ? t('run') : t('rerun')}
        </Button>
        <p className="text-sm text-muted-foreground">{current === null ? t('empty') : t('intro')}</p>
      </div>
      {body}
      {asked !== null && !sameSnapshot(asked, current) ? <p className="text-sm text-amber-700 dark:text-amber-400">{t('changed')}</p> : null}
    </section>
  );
}
