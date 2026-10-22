/**
 * One line for an incident activity's `details` (`itap.incident_activities`), by its kind, as the
 * triggers and functions write them: `status_change` {from, to[, disposition, resolution]}
 * (`incident_activity_log`), `assigned` {from, to}, `escalated` {step, manual, reason[, recipients]}
 * (`escalate_one`), `note` {note_id}, `report_generated` {code, format} (`complete_report`). An
 * unknown shape reads as an empty line, never an error.
 */

const STATUS_LABELS: Readonly<Record<string, string>> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  resolved: 'Resolved',
  closed: 'Closed',
};

const DISPOSITION_LABELS: Readonly<Record<string, string>> = {
  true_positive: 'Real incident',
  false_positive: 'False alarm',
  benign: 'Harmless',
  duplicate: 'Duplicate',
};

const textOf = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

const statusLabel = (value: unknown): string => {
  const text = textOf(value);
  return text === null ? '—' : (STATUS_LABELS[text] ?? text);
};

function statusChange(details: Readonly<Record<string, unknown>>): string {
  if (textOf(details.from) === null) return `Opened as ${statusLabel(details.to)}`;
  const line = `${statusLabel(details.from)} → ${statusLabel(details.to)}`;
  const disposition = textOf(details.disposition);
  const resolution = textOf(details.resolution);
  const outcome = [disposition === null ? null : (DISPOSITION_LABELS[disposition] ?? disposition), resolution]
    .filter((part) => part !== null)
    .join(': ');
  return outcome === '' ? line : `${line} (${outcome})`;
}

function escalated(details: Readonly<Record<string, unknown>>): string {
  const step = typeof details.step === 'number' ? `Step ${details.step}` : 'Escalated';
  const by = details.manual === true ? ' by an operator' : ' by the escalation policy';
  const recipients = typeof details.recipients === 'number' ? `, ${details.recipients} notified` : '';
  const reason = textOf(details.reason);
  return `${step}${by}${recipients}${reason === null ? '' : `: ${reason}`}`;
}

/** The activity in one line, or `''` when its details say nothing more than its kind. */
export function describeActivity(kind: unknown, details: unknown): string {
  const facts =
    typeof details === 'object' && details !== null && !Array.isArray(details)
      ? (details as Readonly<Record<string, unknown>>)
      : {};
  switch (kind) {
    case 'status_change':
      return statusChange(facts);
    case 'assigned':
      return textOf(facts.to) === null ? 'Unassigned' : textOf(facts.from) === null ? 'Assigned' : 'Reassigned';
    case 'escalated':
      return escalated(facts);
    case 'report_generated': {
      const code = textOf(facts.code);
      const format = textOf(facts.format);
      return code === null ? 'Report generated' : `${code}${format === null ? '' : ` (${format.toUpperCase()})`}`;
    }
    default:
      return '';
  }
}
