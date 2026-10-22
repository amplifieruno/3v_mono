import type { BlockViewProps } from '@burojs/react';
import type * as React from 'react';
import type { placesPlaceholderBlock } from './placeholder-block';

/** One muted line in place of a facility tab's future content (`itap:places-placeholder`). */
export function PlacesPlaceholderView({
  props,
  t,
}: BlockViewProps<typeof placesPlaceholderBlock>): React.ReactElement {
  return <p className="text-sm text-muted-foreground">{t(props.topic)}</p>;
}
