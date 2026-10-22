import { cn } from '@burojs/ui-shadcn';
import type * as React from 'react';

export interface BlockNoteProps {
  readonly testId: string;
  readonly tone?: 'muted' | 'error';
  readonly children: React.ReactNode;
}

/** A block's one-line state (choose a facility, reading, failed, nothing yet), in place of its charts. */
export function BlockNote({ testId, tone = 'muted', children }: BlockNoteProps): React.ReactElement {
  return (
    <p data-testid={testId} className={cn('text-sm', tone === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
      {children}
    </p>
  );
}
