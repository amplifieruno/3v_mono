import type * as React from 'react';

/** The problems of one node, under it (plain text: the controls name it with `aria-describedby`, nothing is announced unasked). */
export function NodeProblems({ id, problems }: { readonly id: string; readonly problems: readonly string[] }): React.ReactElement | null {
  if (problems.length === 0) return null;
  return (
    <span id={id} className="text-xs text-destructive">
      {problems.join(' ')}
    </span>
  );
}
