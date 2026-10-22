import { type ScalarInputProps, useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import type { ImageSizeMeta } from './image-size-meta';
import { idOf } from './plan-context';
import { usePresignedUrl } from './presigned-url';

/** The natural size of the image at `url` (the browser decodes it). */
function naturalSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('The image could not be read.'));
    image.src = url;
  });
}

/** The image's own size, read once per file. */
function useImageSize(fileId: string | null) {
  const url = usePresignedUrl(fileId).data?.url;
  return useQuery({
    queryKey: ['itap', 'image-size', fileId],
    queryFn: () => naturalSize(url ?? ''),
    enabled: fileId !== null && url !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * A number of pixels. Empty while the form holds an image, it takes the image's own size;
 * when the image's size differs, a button takes it over.
 */
export function ImageSizeInput(
  props: ScalarInputProps<unknown, ImageSizeMeta>,
): React.ReactElement {
  const {
    value,
    onChange,
    onBlur,
    disabled,
    readOnly,
    meta,
    form,
    accessibility,
    testIds,
    issues,
  } = props;
  const t = useT();
  const fileId = idOf(form?.[meta.imageField]);
  const size = useImageSize(fileId);
  const natural = size.data?.[meta.axis] ?? null;
  const current = numberOf(value);
  const locked = disabled === true || readOnly === true;

  React.useEffect(() => {
    if (!locked && current === null && natural !== null) onChange?.(natural);
  }, [locked, current, natural, onChange]);

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={accessibility.input}
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        className="max-w-40"
        value={current ?? ''}
        disabled={locked}
        data-testid={testIds.input}
        aria-describedby={accessibility.description}
        aria-invalid={issues.length > 0 ? true : undefined}
        onChange={(event) =>
          onChange?.(event.target.value === '' ? null : Number(event.target.value))
        }
        onBlur={onBlur}
      />
      {natural !== null && natural !== current && !locked ? (
        <div>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => onChange?.(natural)}
          >
            {t('console.imageSize.use', { params: { size: natural } })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
