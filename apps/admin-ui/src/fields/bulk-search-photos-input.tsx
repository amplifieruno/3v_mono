import { type ScalarDisplayProps, type ScalarInputProps, useIdentity, useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import { ImagePlus, X } from 'lucide-react';
import * as React from 'react';
import type { ItapIdentity } from '../auth';
import { BULK_INPUT_KIND, SEARCH_IMAGE_KIND } from './bulk-fields';
import { type BulkSearchPhoto, bulkSearchCsv } from './bulk-search-csv';
import { useStorageUpload } from './storage-client';
import type { StorageFileMeta } from './storage-file-meta';
import { StorageFileView } from './storage-file-view';

/** How the input file shows: a plain link to the CSV (owner-only, not sensitive). */
const CSV_META: StorageFileMeta = { bucket: 'organization', kind: BULK_INPUT_KIND, sensitive: false, accept: '.csv', maxSize: null };

const fileId = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/**
 * Picks face photos for a bulk search: each is uploaded as the member's own `search` image, then the
 * job's CSV (`./bulk-search-csv.ts`) is uploaded as their `bulk_input` file and its id written. Adding
 * more photos writes a new CSV with every photo so far; Clear starts again.
 */
export function BulkSearchPhotosInput(props: ScalarInputProps<unknown>): React.ReactElement {
  const { onChange, disabled, readOnly, accessibility, testIds } = props;
  const t = useT();
  const upload = useStorageUpload();
  const { data: identity } = useIdentity<ItapIdentity>();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [photos, setPhotos] = React.useState<readonly BulkSearchPhoto[]>([]);
  const [progress, setProgress] = React.useState<{ readonly done: number; readonly count: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const bucket = identity?.organizationId ?? null;
  const locked = disabled === true || readOnly === true || progress !== null || bucket === null;
  const value = fileId(props.value);
  const errorId = `${accessibility.input ?? 'bulk-search-photos'}-upload-error`;

  const add = async (files: readonly File[]): Promise<void> => {
    setError(null);
    if (bucket === null || files.length === 0) return;
    if (files.some((file) => !file.type.startsWith('image/'))) return setError(t('console.bulk.photos.wrongType'));
    const added: BulkSearchPhoto[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ done: index, count: files.length });
        const { id } = await upload(file, { bucket, kind: SEARCH_IMAGE_KIND });
        added.push({ id, name: file.name });
      }
      const all = [...photos, ...added];
      const csv = new File([bulkSearchCsv(all)], 'bulk-search.csv', { type: 'text/csv' });
      const { id } = await upload(csv, { bucket, kind: BULK_INPUT_KIND });
      setPhotos(all);
      onChange?.(id);
    } catch {
      setError(t('console.bulk.photos.failed'));
    } finally {
      setProgress(null);
    }
  };

  const clear = (): void => {
    setPhotos([]);
    setError(null);
    onChange?.(null);
  };

  return (
    <div className="flex flex-col gap-2" data-testid={testIds.root}>
      <p className="text-sm text-muted-foreground" data-testid="bulk-search-photo-count">
        {photos.length === 0
          ? value === null
            ? t('console.bulk.photos.none')
            : null
          : photos.length === 1
            ? t('console.bulk.photos.countOne')
            : t('console.bulk.photos.count', { params: { count: photos.length } })}
      </p>
      {photos.length > 0 ? (
        <ul className="flex flex-wrap gap-1 text-xs text-muted-foreground">
          {photos.map((photo) => (
            <li key={photo.id} className="rounded-md border px-2 py-0.5">
              {photo.name}
            </li>
          ))}
        </ul>
      ) : value !== null ? (
        <StorageFileView fileId={value} meta={CSV_META} presentation="default" />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          id={accessibility.input}
          type="file"
          multiple
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          disabled={locked}
          data-testid={testIds.input}
          aria-describedby={error ? errorId : accessibility.description}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void add(files);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => inputRef.current?.click()}>
          <ImagePlus className="size-4" aria-hidden />
          {progress === null
            ? t('console.bulk.photos.add')
            : t('console.bulk.photos.adding', { params: { done: progress.done + 1, count: progress.count } })}
        </Button>
        {value !== null && !locked ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <X className="size-4" aria-hidden />
            {t('console.bulk.photos.clear')}
          </Button>
        ) : null}
      </div>
      <p id={errorId} role="alert" className="text-sm text-destructive empty:hidden" data-testid={testIds.error}>
        {error ?? ''}
      </p>
    </div>
  );
}

/** The CSV the photos became, as a link. */
export function BulkSearchPhotosDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const value = fileId(props.value);
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <StorageFileView fileId={value} meta={CSV_META} presentation={props.presentation} />;
}
