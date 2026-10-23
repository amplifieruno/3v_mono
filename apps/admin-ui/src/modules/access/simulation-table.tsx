import { EnumBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { ACCESS_POINT_RESOURCE, IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { ACCESS_DECISION_REASON_ENUM, ACCESS_DECISION_RESULT_ENUM } from '../../enums/access';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import type { AccessNames } from './access-names-query';
import { RecordLink } from './record-link';
import type { SimulationSample } from './simulation-query';

type T = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface SimulationTableProps {
  readonly samples: readonly SimulationSample[];
  readonly names: AccessNames;
  readonly t: T;
}

/** A result with its reason under it. */
function Outcome({ result, reason }: { readonly result: string; readonly reason: string | null }): React.ReactElement {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <EnumBadge enumName={ACCESS_DECISION_RESULT_ENUM} value={result} />
      {reason === null ? null : <EnumBadge enumName={ACCESS_DECISION_REASON_ENUM} value={reason} presentation="plain" />}
    </div>
  );
}

/**
 * The decisions a version would change, oldest first: when, who (person, else the face), where,
 * what the door decided then, what today's policies decide and what they decide with the version.
 */
export function SimulationTable({ samples, names, t }: SimulationTableProps): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table data-testid="simulation-samples">
        <TableHeader>
          <TableRow>
            <TableHead>{t('when')}</TableHead>
            <TableHead>{t('person')}</TableHead>
            <TableHead>{t('door')}</TableHead>
            <TableHead>{t('recorded')}</TableHead>
            <TableHead>{t('today')}</TableHead>
            <TableHead>{t('withVersion')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {samples.map((sample) => (
            <TableRow key={sample.decision_id} data-testid="simulation-sample" data-change={`${sample.old_result}-${sample.new_result}`}>
              <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(instantOf(sample.decided_at) ?? 0)}</TableCell>
              <TableCell>
                {sample.profile_id !== null ? (
                  <RecordLink resource={PROFILE_RESOURCE} id={sample.profile_id} name={names.profiles[sample.profile_id]} fallback={t('gonePerson')} />
                ) : (
                  <RecordLink
                    resource={IDENTITY_RESOURCE}
                    id={sample.identity_id}
                    name={sample.identity_id === null ? undefined : names.identities[sample.identity_id]}
                    fallback={t('unknownPerson')}
                  />
                )}
              </TableCell>
              <TableCell>
                <RecordLink
                  resource={ACCESS_POINT_RESOURCE}
                  id={sample.access_point_id}
                  name={sample.access_point_id === null ? undefined : names.accessPoints[sample.access_point_id]}
                  fallback={t('gonePlace')}
                />
              </TableCell>
              <TableCell>
                <Outcome result={sample.recorded_result} reason={sample.recorded_reason} />
                {sample.drift ? <span className="text-xs text-muted-foreground">{t('drift')}</span> : null}
              </TableCell>
              <TableCell>
                <Outcome result={sample.old_result} reason={sample.old_reason} />
              </TableCell>
              <TableCell className="font-medium">
                <Outcome result={sample.new_result} reason={sample.new_reason} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
