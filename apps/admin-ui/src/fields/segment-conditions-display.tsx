import { type ScalarDisplayProps, useCustomQuery, useT } from '@burojs/react';
import * as React from 'react';
import { conditionsSentence } from './segment-conditions-format';
import { type SegmentConditionsMeta, targetOf } from './segment-conditions-meta';
import { catalogOf } from './segment-conditions-operators';
import { segmentConditionsCatalog } from './segment-conditions-query';
import { isEmptyConditions } from './segment-conditions-tree';

/**
 * The conditions as one readable sentence, fields by their catalog labels and records by name
 * (`Profile type is contractor and End date is between today and in 30 days`); `{}` reads "no
 * conditions". Until the catalog has loaded (or without a target) the field keys are shown.
 */
export function SegmentConditionsDisplay(props: ScalarDisplayProps<unknown, SegmentConditionsMeta>): React.ReactElement {
  const t = useT();
  const target = targetOf(props, props.meta.targetField);
  const empty = isEmptyConditions(props.value);
  const query = useCustomQuery(segmentConditionsCatalog, { target: target ?? '' }, { enabled: target !== undefined && !empty });
  const data = query.data;
  const catalog = React.useMemo(() => (data === undefined ? undefined : catalogOf(data.fields)), [data]);
  const sentence = conditionsSentence(props.value, { t, ...(catalog === undefined ? {} : { catalog }), ...(data === undefined ? {} : { refs: data.refs }) });
  return (
    <span className={empty ? 'text-muted-foreground' : undefined} data-testid={props.testIds.display}>
      {sentence}
    </span>
  );
}
