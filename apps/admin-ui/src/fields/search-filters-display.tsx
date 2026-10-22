import { type ScalarDisplayProps, useCustomQuery, useOptionalLocale, useT } from '@burojs/react';
import type * as React from 'react';
import { useEnumLabel } from '../blocks/charts/use-enum-label';
import { IDENTITY_STATUS_ENUM } from '../enums/identities';
import { PROFILE_TYPE_ENUM } from '../enums/people';
import { SEARCH_GENDER_ENUM, SEARCH_LINKED_ENUM } from '../enums/search';
import { formatDateTime, instantOf } from './date-time-format';
import { type SearchFilterNamer, filterReferences, searchFilterParts } from './search-filters-format';
import { searchFilterNamesQuery } from './search-filters-query';

/** An enum label by enum name (the hook needs one name per call, so each enum is read once). */
function useEnumLabels(): (enumName: string, value: string) => string {
  const labels: Readonly<Record<string, (value: string) => string>> = {
    [IDENTITY_STATUS_ENUM]: useEnumLabel(IDENTITY_STATUS_ENUM),
    [PROFILE_TYPE_ENUM]: useEnumLabel(PROFILE_TYPE_ENUM),
    [SEARCH_GENDER_ENUM]: useEnumLabel(SEARCH_GENDER_ENUM),
    [SEARCH_LINKED_ENUM]: useEnumLabel(SEARCH_LINKED_ENUM),
  };
  return (enumName, value) => labels[enumName]?.(value) ?? value;
}

/**
 * A search's filters as labelled parts (`Identity status: Verified`, `Company: Acme`), the company
 * and facility named from the organization's records; "Everyone (no filters)" when there are none.
 * One line in a list cell (`plain`), one part per line on a record page.
 */
export function SearchFiltersDisplay(props: ScalarDisplayProps<unknown>): React.ReactElement {
  const t = useT();
  const locale = useOptionalLocale();
  const enumLabel = useEnumLabels();
  const refs = filterReferences(props.value);
  const named = refs.companies.length + refs.facilities.length > 0;
  const names = useCustomQuery(searchFilterNamesQuery, refs, { enabled: named });
  const namer: SearchFilterNamer = {
    text: (key, params) => t(`console.searchFilters.${key}`, params === undefined ? undefined : { params }),
    enumLabel,
    name: (kind, id) => {
      const rows = kind === 'company' ? names.data?.companies : names.data?.facilities;
      return rows?.find((row) => row.id.toLowerCase() === id.toLowerCase())?.name ?? (names.data === undefined ? '…' : null);
    },
    dateTime: (iso) => {
      const at = instantOf(iso);
      return at === null ? iso : formatDateTime(at, locale);
    },
  };
  const parts = searchFilterParts(props.value, namer);
  const plain = props.presentation === 'plain';
  if (parts.length === 0) {
    return (
      <span className={plain ? undefined : 'text-muted-foreground'} data-testid={props.testIds.display}>
        {namer.text('everyone')}
      </span>
    );
  }
  if (plain) {
    return (
      <span data-testid={props.testIds.display}>{parts.map((part) => `${part.label}: ${part.value}`).join(' · ')}</span>
    );
  }
  return (
    <ul data-testid={props.testIds.display} className="flex flex-col gap-0.5 text-sm">
      {parts.map((part) => (
        <li key={part.key} data-filter={part.key}>
          <span className="text-muted-foreground">{part.label}:</span> {part.value}
        </li>
      ))}
    </ul>
  );
}
