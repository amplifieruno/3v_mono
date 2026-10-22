import { type ScalarInputProps, formatBytes, useT } from '@burojs/react';
import { Button, Input } from '@burojs/ui-shadcn';
import { Upload, X } from 'lucide-react';
import * as React from 'react';
import { InlineFileDisplay } from './inline-file-display';
import { readBase64 } from './inline-file';
import type { InlineFileMeta } from './inline-file-meta';
import { acceptsFile } from './storage-file-meta';

/**
 * Picks a file and reads it into the value (name, type, size, base64); a file of another type
 * or over the size limit is refused under the field before it is read, and keeps the value.
 */
export function InlineFileInput(props: ScalarInputProps<unknown, InlineFileMeta>): React.ReactElement {
  const { meta, value, onChange, onBlur, disabled, readOnly, accessibility, testIds } = props;
  const t = useT();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const locked = disabled === true || readOnly === true || busy;
  const errorId = `${accessibility.input ?? 'inline-file'}-read-error`;
  const picked = value !== null && value !== undefined;

  const pick = async (file: File): Promise<void> => {
    setError(null);
    if (!acceptsFile(file, meta.accept)) return setError(t('console.storageFile.wrongType'));
    if (file.size > meta.maxSize) {
      return setError(t('console.storageFile.tooLarge', { params: { max: formatBytes(meta.maxSize) } }));
    }
    setBusy(true);
    try {
      const content = await readBase64(file);
      onChange?.({ file_name: file.name, mime_type: file.type, size: file.size, content_base64: content });
    } catch {
      setError(t('console.inlineFile.unreadable'));
    } finally {
      setBusy(false);
      onBlur?.();
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid={testIds.root}>
      {picked ? <InlineFileDisplay {...props} presentation="default" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          id={accessibility.input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={meta.accept}
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
          {busy ? t('console.inlineFile.reading') : t(picked ? 'console.inlineFile.replace' : 'console.inlineFile.choose')}
        </Button>
        {picked && !locked ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange?.(null)}>
            <X className="size-4" aria-hidden />
            {t('console.storageFile.remove')}
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {t('console.inlineFile.limits', { params: { accept: meta.accept, max: formatBytes(meta.maxSize) } })}
        </span>
      </div>
      <p id={errorId} role="alert" className="text-sm text-destructive empty:hidden" data-testid={testIds.error}>
        {error ?? ''}
      </p>
    </div>
  );
}
