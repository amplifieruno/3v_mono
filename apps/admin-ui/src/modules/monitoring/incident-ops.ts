import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { MONITORING_BINDING } from '../../blocks/occupancy-now/occupancy-query';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { INCIDENT_ACTIVITY_RESOURCE, INCIDENT_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { MEMBER_NOT_ACTIVE_REFUSAL, type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { INCIDENT_DISPOSITIONS, REPORT_FORMATS } from '../../enums/incidents';

const NOTHING = ' Nothing was changed.';

/** What every incident function raises (`itap.lock_incident`, `incidents_validate_transition`). */
const LIFECYCLE_REFUSALS = {
  incident_not_found: 'The incident no longer exists in this organization.' + NOTHING,
  incident_invalid_transition:
    'Someone else moved the incident on in the meantime (its status no longer allows this step): reload it to see where it stands.' +
    NOTHING,
  // The incident's member column (`assigned_to`) is checked by `active_member_check` on every write.
  member_not_active: MEMBER_NOT_ACTIVE_REFUSAL,
} satisfies Record<string, SqlRefusalText>;

/** What `resolve_incident` raises beside the lifecycle refusals. */
export const RESOLVE_REFUSALS = {
  ...LIFECYCLE_REFUSALS,
  incident_disposition_required: 'Choose what the incident turned out to be (the disposition).' + NOTHING,
};

/** What `escalate_incident` raises: the incident is gone, or already resolved or closed. */
export const ESCALATE_REFUSALS = {
  incident_not_found: LIFECYCLE_REFUSALS.incident_not_found,
  incident_not_active: 'The incident is already resolved or closed: there is nobody left to escalate it to.' + NOTHING,
  member_not_active: MEMBER_NOT_ACTIVE_REFUSAL,
};

/** What `generate_incident_report` raises. */
export const REPORT_REFUSALS = {
  incident_not_found: LIFECYCLE_REFUSALS.incident_not_found,
  member_not_active: MEMBER_NOT_ACTIVE_REFUSAL,
};

export const incidentIdInput = z.object({ incidentId: z.string().uuid() });
export const resolveIncidentInput = z.object({
  incidentId: z.string().uuid(),
  disposition: z.enum(INCIDENT_DISPOSITIONS),
  resolution: z.string().nullable().optional(),
});
export const escalateIncidentInput = z.object({
  incidentId: z.string().uuid(),
  reason: z.string().nullable().optional(),
});
export const incidentReportInput = z.object({ incidentId: z.string().uuid(), format: z.enum(REPORT_FORMATS) });

/**
 * The incident as the functions return it, with the name of the member who acknowledged it: after
 * "Acknowledge" on an incident someone else acknowledged meanwhile, that is the other member.
 */
export const changedIncident = z.object({
  id: z.string(),
  code: z.string(),
  status: z.string(),
  acknowledged_by_name: z.string(),
});
export const queuedReport = z.object({ id: z.string(), code: z.string(), format: z.string() });

/** Trimmed text, or `null` when blank. */
function textOrNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
}

const INCIDENT_SELECTION = 'id code status acknowledged_by_member { user { displayName email } }';

/** The account name (else email) of the member who acknowledged, read from the answer. */
function acknowledgedByName(row: Readonly<Record<string, unknown>>): string {
  const user = (row.acknowledged_by_member as { readonly user?: { displayName?: string; email?: string } } | null)?.user;
  return textOrNull(user?.displayName) ?? textOrNull(user?.email) ?? 'nobody yet';
}

/** One incident function (`SETOF itap.incidents`) answering the changed incident. */
function incidentOperation(
  operation: string,
  field: string,
  document: string,
  variables: (input: unknown) => Readonly<Record<string, unknown>>,
  refusals: Readonly<Record<string, SqlRefusalText>>,
): HasuraOperationEntry {
  return hasuraOperation(
    MONITORING_BINDING,
    operation,
    {
      kind: 'mutation',
      document,
      variables,
      mapResult: (data) => {
        const rows = rootOf(data, field);
        const row = Array.isArray(rows) ? (rows[0] as Readonly<Record<string, unknown>> | undefined) : undefined;
        if (row === undefined) return null;
        return { id: row.id, code: row.code, status: row.status, acknowledged_by_name: acknowledgedByName(row) };
      },
    },
    sqlRefusals(refusals),
  );
}

const incidentOnly = (input: unknown) => ({ incident: (input as z.infer<typeof incidentIdInput>).incidentId });

/** `acknowledge_incident(hasura_session, p_incident)`: open → acknowledged; an acknowledged one is answered unchanged. */
export const acknowledgeIncidentOperation = incidentOperation(
  'acknowledgeIncident',
  'acknowledge_incident',
  `mutation AcknowledgeIncident($incident: uuid!) {
  acknowledge_incident(args: { p_incident: $incident }) { ${INCIDENT_SELECTION} }
}`,
  incidentOnly,
  LIFECYCLE_REFUSALS,
);

/** `start_investigation(hasura_session, p_incident)`: open, acknowledged or resolved (reopen) → investigating. */
export const startInvestigationOperation = incidentOperation(
  'startInvestigation',
  'start_investigation',
  `mutation StartInvestigation($incident: uuid!) {
  start_investigation(args: { p_incident: $incident }) { ${INCIDENT_SELECTION} }
}`,
  incidentOnly,
  LIFECYCLE_REFUSALS,
);

/** `resolve_incident(hasura_session, p_incident, p_disposition, p_resolution)`: → resolved. */
export const resolveIncidentOperation = incidentOperation(
  'resolveIncident',
  'resolve_incident',
  `mutation ResolveIncident($incident: uuid!, $disposition: String!, $resolution: String) {
  resolve_incident(args: { p_incident: $incident, p_disposition: $disposition, p_resolution: $resolution }) { ${INCIDENT_SELECTION} }
}`,
  (input) => {
    const { incidentId, disposition, resolution } = input as z.infer<typeof resolveIncidentInput>;
    return { incident: incidentId, disposition, resolution: textOrNull(resolution) };
  },
  RESOLVE_REFUSALS,
);

/** `close_incident(hasura_session, p_incident)`: resolved → closed (final). */
export const closeIncidentOperation = incidentOperation(
  'closeIncident',
  'close_incident',
  `mutation CloseIncident($incident: uuid!) {
  close_incident(args: { p_incident: $incident }) { ${INCIDENT_SELECTION} }
}`,
  incidentOnly,
  LIFECYCLE_REFUSALS,
);

/** `escalate_incident(hasura_session, p_incident, p_reason)`: the next escalation step, now. */
export const escalateIncidentOperation = incidentOperation(
  'escalateIncident',
  'escalate_incident',
  `mutation EscalateIncident($incident: uuid!, $reason: String) {
  escalate_incident(args: { p_incident: $incident, p_reason: $reason }) { ${INCIDENT_SELECTION} }
}`,
  (input) => {
    const { incidentId, reason } = input as z.infer<typeof escalateIncidentInput>;
    return { incident: incidentId, reason: textOrNull(reason) };
  },
  ESCALATE_REFUSALS,
);

/** `generate_incident_report(hasura_session, p_incident, p_format)`: a queued incident report. */
export const generateIncidentReportOperation = hasuraOperation(
  MONITORING_BINDING,
  'generateIncidentReport',
  {
    kind: 'mutation',
    document: `mutation GenerateIncidentReport($incident: uuid!, $format: String!) {
  generate_incident_report(args: { p_incident: $incident, p_format: $format }) { id code format }
}`,
    variables: (input) => {
      const { incidentId, format } = input as z.infer<typeof incidentReportInput>;
      return { incident: incidentId, format };
    },
    mapResult: (data) => {
      const rows = rootOf(data, 'generate_incident_report');
      return Array.isArray(rows) ? (rows[0] ?? null) : null;
    },
  },
  sqlRefusals(REPORT_REFUSALS),
);

/** What a lifecycle step changes: the incident (list and page) and its timeline, read again after the step. */
export const INCIDENT_EFFECTS = [{ resource: INCIDENT_RESOURCE }, { resource: INCIDENT_ACTIVITY_RESOURCE }];

const incidentMutation = <T>(id: string, entry: HasuraOperationEntry, input: z.ZodType<T, z.ZodTypeDef, unknown>) =>
  defineMutation(id, {
    binding: entry.binding,
    input: schema(input),
    output: schema(changedIncident.nullable()),
    effects: INCIDENT_EFFECTS,
  });

export const acknowledgeIncident = incidentMutation('itap:acknowledge-incident', acknowledgeIncidentOperation, incidentIdInput);
export const startInvestigation = incidentMutation('itap:start-investigation', startInvestigationOperation, incidentIdInput);
export const resolveIncident = incidentMutation('itap:resolve-incident', resolveIncidentOperation, resolveIncidentInput);
export const closeIncident = incidentMutation('itap:close-incident', closeIncidentOperation, incidentIdInput);
export const escalateIncident = incidentMutation('itap:escalate-incident', escalateIncidentOperation, escalateIncidentInput);

/** Queues an incident report; the report is generated in the background and listed on the reports pages. */
export const generateIncidentReport = defineMutation('itap:generate-incident-report', {
  binding: generateIncidentReportOperation.binding,
  input: schema(incidentReportInput),
  output: schema(queuedReport.nullable()),
  effects: [{ resource: INCIDENT_ACTIVITY_RESOURCE }],
});

/** The incident operations, for the module's registry. */
export const INCIDENT_OPERATIONS = [
  acknowledgeIncidentOperation,
  startInvestigationOperation,
  resolveIncidentOperation,
  closeIncidentOperation,
  escalateIncidentOperation,
  generateIncidentReportOperation,
];
