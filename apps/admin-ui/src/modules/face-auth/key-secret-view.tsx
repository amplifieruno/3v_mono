import type { BlockViewProps } from '@burojs/react';
import { Button, Input, Label, toast } from '@burojs/ui-shadcn';
import { Copy, TriangleAlert } from 'lucide-react';
import type * as React from 'react';
import type { clientKeySecretBlock } from './key-secret-block';

/**
 * The new key's prefix and its one-time secret with a copy button and the warning
 * (`itap:client-key-secret`). Rendered from the flow's answer only; nothing here writes the
 * secret anywhere but the clipboard, and only when the administrator asks.
 */
export function ClientKeySecretView({ props, t }: BlockViewProps<typeof clientKeySecretBlock>): React.ReactElement {
  const expiresAt = props.expiresAt === null || props.expiresAt === undefined ? null : new Date(props.expiresAt).toLocaleString();
  // The Clipboard API exists only in a secure context (HTTPS or localhost); over plain HTTP the
  // secret stays selectable in the field and the button says it could not copy.
  const copy = (): void => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard) {
      toast.error(t('copyFailed'));
      return;
    }
    clipboard.writeText(props.secret).then(
      () => toast.success(t('copied')),
      () => toast.error(t('copyFailed')),
    );
  };
  return (
    <div data-testid="client-key-secret" className="flex flex-col gap-3">
      <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t('warning')}
      </p>
      <div className="flex flex-col gap-1">
        <Label htmlFor="client-key-prefix">{t('prefix')}</Label>
        <Input id="client-key-prefix" readOnly value={props.prefix} className="font-mono" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="client-key-secret">{t('secret')}</Label>
        <div className="flex items-center gap-2">
          <Input id="client-key-secret" readOnly value={props.secret} className="font-mono" autoComplete="off" spellCheck={false} />
          <Button type="button" variant="outline" onClick={copy}>
            <Copy className="size-4" aria-hidden />
            {t('copy')}
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{expiresAt === null ? t('noExpiry') : t('expires', { params: { expiresAt } })}</p>
      <p className="text-sm text-muted-foreground">{t('overlap')}</p>
    </div>
  );
}
