import type { BlockViewProps } from '@burojs/react';
import { Button, Input, toast } from '@burojs/ui-shadcn';
import { Copy } from 'lucide-react';
import type * as React from 'react';
import type { invitationTokenBlock } from './invitation-token-block';

/** The one-time invitation token with a copy button (`itap:invitation-token`). */
export function InvitationTokenView({
  props,
  t,
}: BlockViewProps<typeof invitationTokenBlock>): React.ReactElement {
  const expiresAt = new Date(props.expiresAt).toLocaleString();
  // The Clipboard API exists only in a secure context (HTTPS or localhost); over plain HTTP the
  // token stays selectable in the field and the button says it could not copy.
  const copy = (): void => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard) {
      toast.error(t('copyFailed'));
      return;
    }
    clipboard.writeText(props.token).then(
      () => toast.success(t('copied')),
      () => toast.error(t('copyFailed')),
    );
  };
  return (
    <div data-testid="invitation-token" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('intro')}</p>
      <div className="flex items-center gap-2">
        <Input readOnly value={props.token} className="font-mono" aria-label={t('label')} />
        <Button type="button" variant="outline" onClick={copy}>
          <Copy className="size-4" aria-hidden />
          {t('copy')}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t('expires', { params: { expiresAt } })}</p>
    </div>
  );
}
