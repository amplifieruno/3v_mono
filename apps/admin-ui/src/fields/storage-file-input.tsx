import { type ScalarInputProps, formatBytes, useIdentity, useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import { Upload, X } from 'lucide-react';
import * as React from 'react';
import type { ItapIdentity } from '../auth';
import { StorageRequestError, useStorageUpload } from './storage-client';
import { ORG_LOGOS_BUCKET } from './storage-file';
import { type StorageFileMeta, acceptsFile } from './storage-file-meta';
import { StorageFileView } from './storage-file-view';

const fileId = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

/**
 * Picks a file, uploads it to hasura-storage and writes the new file id. A
 * refused or failed upload is shown under the field and keeps the value.
 */
export function StorageFileInput(
  props: ScalarInputProps<unknown, StorageFileMeta>,
): React.ReactElement {
  const { meta, onChange, disabled, readOnly, accessibility, testIds } = props;
  const t = useT();
  const upload = useStorageUpload();
  const { data: identity } = useIdentity<ItapIdentity>();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const value = fileId(props.value);
  const bucket = meta.bucket === 'organization' ? (identity?.organizationId ?? null) : ORG_LOGOS_BUCKET;
  const locked = disabled === true || readOnly === true || busy || bucket === null;
  // Our own id: `accessibility.error` belongs to the host's validation message.
  const errorId = `${accessibility.input ?? 'storage-file'}-upload-error`;

  const pick = async (file: File): Promise<void> => {
    setError(null);
    if (!acceptsFile(file, meta.accept)) return setError(t('console.storageFile.wrongType'));
    if (meta.maxSize !== null && file.size > meta.maxSize) {
      return setError(t('console.storageFile.tooLarge', { params: { max: formatBytes(meta.maxSize) } }));
    }
    if (bucket === null) return;
    setBusy(true);
    try {
      const { id } = await upload(file, { bucket, kind: meta.kind });
      onChange?.(id);
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
    <div className="flex flex-col gap-2" data-testid={testIds.root}>
      {value ? <StorageFileView fileId={value} meta={meta} presentation="default" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          id={accessibility.input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={meta.accept ?? undefined}
          disabled={locked}
          data-testid={testIds.input}
          aria-describedby={error ? errorId : accessibility.description}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void pick(file);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => inputRef.current?.click()}>
          <Upload className="size-4" aria-hidden />
          {busy
            ? t('console.storageFile.uploading')
            : t(value ? 'console.storageFile.replace' : 'console.storageFile.upload')}
        </Button>
        {value && !locked ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange?.(null)}>
            <X className="size-4" aria-hidden />
            {t('console.storageFile.remove')}
          </Button>
        ) : null}
        {meta.accept ? (
          <span className="text-xs text-muted-foreground">
            {t('console.storageFile.accepts', { params: { accept: meta.accept } })}
          </span>
        ) : null}
      </div>
      <p id={errorId} role="alert" className="text-sm text-destructive empty:hidden" data-testid={testIds.error}>
        {error ?? ''}
      </p>
    </div>
  );
}
