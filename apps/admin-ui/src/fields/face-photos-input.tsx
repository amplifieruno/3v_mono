import { type ScalarInputProps, formatBytes, useIdentity, useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import { Upload, X } from 'lucide-react';
import * as React from 'react';
import type { ItapIdentity } from '../auth';
import { WebcamCapture } from '../blocks/webcam-capture/webcam-capture';
import { facePhotoIds } from './face-photos-format';
import type { FacePhotosMeta } from './face-photos-meta';
import { PhotoThumb } from './photo-thumb';
import { StorageRequestError, useStorageUpload } from './storage-client';
import { acceptsFile } from './storage-file-meta';

/**
 * Face photos for an enrollment action: numbered thumbnails with Remove, "Upload photos" (one
 * or several files) and the browser camera. Each photo is uploaded to the organization's files
 * as soon as it is picked or taken, and its id is added to the value; a refused file is named
 * under the field and nothing is added for it. At `max` photos both ways to add are locked.
 */
export function FacePhotosInput(props: ScalarInputProps<unknown, FacePhotosMeta>): React.ReactElement {
  const { meta, onChange, disabled, readOnly, accessibility, testIds } = props;
  const t = useT();
  const upload = useStorageUpload();
  const { data: identity } = useIdentity<ItapIdentity>();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const ids = facePhotoIds(props.value);
  // The value as last written: several uploads in a row each add to the list before a re-render.
  const latest = React.useRef(ids);
  latest.current = ids;
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bucket = identity?.organizationId ?? null;
  const locked = disabled === true || readOnly === true || bucket === null;
  const full = ids.length >= meta.max;
  const errorId = `${accessibility.input ?? 'face-photos'}-upload-error`;

  const write = (next: string[]): void => {
    latest.current = next;
    onChange?.(next);
  };

  /** Uploads `files` one after another, up to the free places; stops at the first refusal. */
  const add = async (files: readonly File[]): Promise<void> => {
    setError(null);
    if (bucket === null) return;
    const free = meta.max - latest.current.length;
    if (files.length > free) setError(t('console.facePhotos.tooMany', { params: { max: meta.max } }));
    setBusy(true);
    try {
      for (const file of files.slice(0, Math.max(0, free))) {
        if (!acceptsFile(file, meta.accept)) return setError(t('console.facePhotos.wrongType', { params: { name: file.name } }));
        if (file.size > meta.maxSize) {
          return setError(
            t('console.facePhotos.tooLarge', { params: { name: file.name, max: formatBytes(meta.maxSize) } }),
          );
        }
        const { id } = await upload(file, { bucket, kind: meta.kind });
        write([...latest.current, id]);
      }
    } catch (cause) {
      setError(
        cause instanceof StorageRequestError
          ? t('console.storageFile.refused', { params: { status: cause.status, message: cause.message } })
          : t('console.storageFile.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid={testIds.root}>
      {ids.length > 0 ? (
        <ol className="flex flex-wrap gap-3" aria-label={t('console.facePhotos.chosen')}>
          {ids.map((id, index) => {
            const label = t('console.facePhotos.photo', { params: { index: index + 1 } });
            return (
              <li key={id} className="flex flex-col items-center gap-1">
                <PhotoThumb fileId={id} alt={label} />
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {index + 1}
                  {locked ? null : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1"
                      aria-label={t('console.facePhotos.remove', { params: { index: index + 1 } })}
                      onClick={() => write(latest.current.filter((other) => other !== id))}
                    >
                      <X className="size-3" aria-hidden />
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t('console.facePhotos.count', { params: { count: ids.length, min: meta.min, max: meta.max } })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          id={accessibility.input}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          accept={meta.accept}
          disabled={locked || busy || full}
          data-testid={testIds.input}
          aria-describedby={error ? errorId : accessibility.description}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length > 0) void add(files);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={locked || busy || full}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-4" aria-hidden />
          {busy ? t('console.storageFile.uploading') : t('console.facePhotos.upload')}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t('console.facePhotos.limits', { params: { max: formatBytes(meta.maxSize) } })}
        </span>
      </div>
      {locked ? null : <WebcamCapture disabled={busy || full} done={full} onCapture={(file) => add([file])} />}
      <p id={errorId} role="alert" className="text-sm text-destructive empty:hidden" data-testid={testIds.error}>
        {error ?? ''}
      </p>
    </div>
  );
}
