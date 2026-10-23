import { f } from '@burojs/field-types';
import { USER_RESOURCE } from '../../data/resource-names';
import {
  INTEGRATION_DIRECTIONS,
  INTEGRATION_DIRECTION_ENUM,
  INTEGRATION_KINDS,
  INTEGRATION_KIND_ENUM,
  INTEGRATION_STATUSES,
  INTEGRATION_STATUS_ENUM,
} from '../../enums/compliance-integrations';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { integrationJson } from '../../fields/integration-config';
import { checkNotBlank } from '../../fields/not-blank';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/**
 * Columns of `itap.integrations` the `org_admin` role reads. The secret is not among them: it is
 * write-only (no select permission), set or cleared by the `set_integration_secret` action only,
 * and the page shows whether one is stored (`has_secret`). The kind is fixed once created; the
 * last sync, its error and the next scheduled sync are the platform's.
 */
export const integrationFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({ system: true, in: [...shown], texts: { label: 'Code', doc: { summary: 'The integration’s reference (INT-00001).' } } }),
  name: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'What the integration is called in the console, unique in the organization.' } },
  }),
  kind: enumField(INTEGRATION_KINDS, INTEGRATION_KIND_ENUM, {
    required: true,
    write: 'create',
    texts: {
      label: 'Kind',
      doc: {
        summary:
          'What the integration connects: an HR system (imports people; the only kind whose sync writes data in this demo), SIEM, building management, webhook, ERP or custom (stubs). Fixed once created.',
      },
    },
  }),
  provider: f.string({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Provider', doc: { summary: 'The product on the other side, such as "Workday" or "Splunk HEC".' } },
  }),
  direction: enumField(INTEGRATION_DIRECTIONS, INTEGRATION_DIRECTION_ENUM, {
    required: true,
    default: 'inbound',
    texts: { label: 'Direction', doc: { summary: 'Whether data flows into ITAP, out of it, or both.' } },
  }),
  status: enumField(INTEGRATION_STATUSES, INTEGRATION_STATUS_ENUM, {
    required: true,
    default: 'active',
    texts: {
      label: 'Status',
      doc: { summary: 'Active or paused (no sync runs while paused). Error is set by the platform when a sync fails and cleared by the next successful one.' },
    },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: { label: 'Description', doc: { summary: 'What the integration is for and who runs the other side.' } } }),
  config: integrationJson({
    kind: 'config',
    in: ['show', 'create', 'edit'],
    texts: {
      label: 'Settings',
      description: 'A JSON object. Use Schedule to set when it syncs.',
      doc: {
        summary:
          'The connector’s settings as a JSON object: schedule_cron and schedule_timezone (when it syncs; Schedule edits them), fixture_file_id and external_id_field for the HR fixture, endpoint and other connector options, simulate_error to demonstrate a failing sync. Never put a password here: use Set secret.',
      },
    },
  }),
  field_mapping: integrationJson({
    kind: 'mapping',
    in: ['show', 'create', 'edit'],
    texts: {
      label: 'Field mapping',
      description: 'A JSON object of source field → profile column.',
      doc: {
        summary:
          'For an HR integration: which field of a source record fills which profile column (such as "GivenName": "first_name"). Records whose values do not fit a column are skipped with a code in the run.',
      },
    },
  }),
  has_secret: f.boolean({
    system: true,
    in: [...shown],
    texts: {
      label: 'Secret stored',
      doc: { summary: 'Whether a secret (API token, password) is stored. The secret itself is never shown or read back: Set secret replaces it, Clear secret removes it.' },
    },
  }),
  last_sync_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Last sync', doc: { summary: 'When the last successful sync started; outbound stubs count what happened since then.' } },
  }),
  next_sync_at: dateTime({
    system: true,
    in: [...showOnly],
    texts: { label: 'Next sync', doc: { summary: 'When the schedule runs it next (planned within 15 minutes of a schedule change); empty without a schedule.' } },
  }),
  last_error: f.string({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: { label: 'Last error', doc: { summary: 'Why the last sync failed, as a code (never source values); cleared by the next successful sync.' } },
  }),
  created_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: [...showOnly],
    open: 'none',
    texts: { label: 'Created by', doc: { summary: 'The member who added the integration.' } },
  }),
  created_at: f.dateTime({ system: true, in: [...showOnly], texts: { label: 'Created', doc: { summary: 'When the integration was added.' } } }),
  updated_at: f.dateTime({ system: true, in: [...showOnly], texts: { label: 'Updated', doc: { summary: 'When its settings last changed.' } } }),
};
