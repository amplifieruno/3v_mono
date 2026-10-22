import type * as React from 'react';
import type { LiveCameraT } from './live-camera-texts';
import type { DetectionCounters } from './use-detections';

const COUNTERS = ['detections', 'known', 'newIdentities', 'unidentified'] as const;

export interface LiveCountersProps {
  readonly counters: DetectionCounters;
  readonly t: LiveCameraT;
}

/** The detections received since the view opened, by kind. */
export function LiveCounters({ counters, t }: LiveCountersProps): React.ReactElement {
  return (
    <dl aria-label={t('counters')} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {COUNTERS.map((key) => (
        <div key={key} className="flex items-baseline gap-1">
          <dt className="text-muted-foreground">{t(`count_${key}`)}</dt>
          <dd className="font-medium tabular-nums" data-testid={`live-count:${key}`}>
            {counters[key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
