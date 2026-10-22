import { type ScalarInputProps, useCustomQuery, useT } from '@burojs/react';
import { Button, cn } from '@burojs/ui-shadcn';
import { Check } from 'lucide-react';
import type * as React from 'react';
import { PhotoThumb } from './photo-thumb';
import { type SplitChoice, splitChoiceOf } from './split-photos-format';
import { identitySplitParts, templatesOf } from './split-photos-query';

/**
 * The identity's photos as thumbnails to toggle: the chosen ones (marked) split off with their
 * face templates. Says how many photos stay; choosing all of them leaves the identity without a
 * face.
 */
export function SplitPhotosInput(props: ScalarInputProps<unknown>): React.ReactElement {
  const { onChange, disabled, readOnly, testIds } = props;
  const t = useT();
  const choice = splitChoiceOf(props.value);
  const parts = useCustomQuery(identitySplitParts, { identityId: choice.identityId }, {
    enabled: choice.identityId !== '',
  });
  const locked = disabled === true || readOnly === true;
  if (parts.data === undefined) {
    return <p className="text-sm text-muted-foreground">{t('console.splitPhotos.loading')}</p>;
  }
  const data = parts.data;
  const chosen = new Set(choice.photos.map((photo) => photo.id));
  const toggle = (id: string): void => {
    const next = data.photos.filter((photo) => (photo.id === id ? !chosen.has(id) : chosen.has(photo.id)));
    const value: SplitChoice = {
      identityId: choice.identityId,
      photos: next.map((photo) => ({ id: photo.id, fileId: photo.file_id })),
      embeddingIds: templatesOf(data, next.map((photo) => photo.file_id)),
    };
    onChange?.(value);
  };
  if (data.photos.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('console.splitPhotos.none')}</p>;
  }
  return (
    <div className="flex flex-col gap-2" data-testid={testIds.root}>
      <ul className="flex flex-wrap gap-3" aria-label={t('console.splitPhotos.choose')}>
        {data.photos.map((photo, index) => {
          const on = chosen.has(photo.id);
          const label = t('console.splitPhotos.photo', { params: { index: index + 1 } });
          return (
            <li key={photo.id}>
              <Button
                type="button"
                variant="outline"
                aria-pressed={on}
                aria-label={label}
                disabled={locked}
                className={cn('relative h-auto p-1', on && 'border-primary ring-2 ring-primary')}
                onClick={() => toggle(photo.id)}
              >
                <PhotoThumb fileId={photo.file_id} alt={label} className="size-20" />
                {on ? (
                  <Check className="absolute right-1 top-1 size-4 rounded-full bg-primary text-primary-foreground" aria-hidden />
                ) : null}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t('console.splitPhotos.count', {
          params: { chosen: chosen.size, stay: data.photos.length - chosen.size, templates: choice.embeddingIds.length },
        })}
      </p>
    </div>
  );
}
