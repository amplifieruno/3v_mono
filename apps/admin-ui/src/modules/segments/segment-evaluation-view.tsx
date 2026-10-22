import type { BlockViewProps } from '@burojs/react';
import { CircleCheck, Info } from 'lucide-react';
import type * as React from 'react';
import type { segmentEvaluationBlock } from './segment-evaluation-block';

type Props = BlockViewProps<typeof segmentEvaluationBlock>;

/** What the answer says: joined and left, or stale; `null` before the run. */
function outcome({ props, t }: Props): { readonly stale: boolean; readonly lines: readonly string[] } | null {
  const { added, removed, memberCount } = props;
  if (added == null || removed == null || memberCount == null) return null;
  if (props.stale === true) return { stale: true, lines: [t('stale', { params: { count: memberCount } })] };
  const first = added + removed === 0 ? t('unchanged') : t('done', { params: { added, removed } });
  return { stale: false, lines: [first, t('members', { params: { count: memberCount } })] };
}

/** "Evaluate now" before the run and its answer after (`itap:segment-evaluation`). */
export function SegmentEvaluationView(view: Props): React.ReactElement {
  const { t } = view;
  const answer = outcome(view);
  const Icon = answer === null || answer.stale ? Info : CircleCheck;
  return (
    <div data-testid="segment-evaluation" data-state={answer === null ? 'ready' : answer.stale ? 'stale' : 'done'} className="flex items-start gap-2 text-sm">
      <Icon className={answer?.stale === false ? 'mt-0.5 size-5 shrink-0 text-emerald-600' : 'mt-0.5 size-5 shrink-0 text-muted-foreground'} aria-hidden />
      <div className="flex flex-col gap-1">
        {answer === null ? <p>{t('intro')}</p> : answer.lines.map((line, index) => <p key={line} className={index === 0 ? 'font-medium' : undefined}>{line}</p>)}
        <p className="text-muted-foreground">{t('manual')}</p>
      </div>
    </div>
  );
}
