import type * as React from 'react';

export interface StreamNoteProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly hint?: string;
  readonly action?: React.ReactNode;
}

/** A note centred over the picture area: what is (not) showing, and why. */
export function StreamNote({ icon, title, hint, action }: StreamNoteProps): React.ReactElement {
  return (
    <div
      role="status"
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground"
    >
      {icon}
      <p className="font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-xs">{hint}</p> : null}
      {action}
    </div>
  );
}
