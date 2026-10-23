import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { DEVICE_RESOURCE, FACILITY_RESOURCE, TERMINAL_POLICY_SYNC_RESOURCE } from '../../data/resource-names';
import { TERMINAL_SYNC_RESULTS, TERMINAL_SYNC_RESULT_ENUM } from '../../enums/access';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { recordDate } from '../people/record-date';

/** Page size of the sync log (every terminal, every minute at most). */
export const SYNC_PAGE_SIZE = 50;

/**
 * Columns of `itap.terminal_policy_syncs` the `org_admin` role reads: one row per push of the
 * rule set to an access terminal, written by the sync only (append-only, not audited; a repeated
 * failure is logged once, on the change).
 */
export const terminalPolicySyncFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  created_at: dateTime({ system: true, texts: { label: 'Pushed', doc: { summary: 'When the rule set was pushed to the terminal (or the push failed).' } } }),
  device_id: f.relation({
    to: DEVICE_RESOURCE,
    system: true,
    open: 'page',
    texts: { label: 'Terminal', doc: { summary: 'The access terminal the rule set was pushed to.' } },
  }),
  facility_id: f.relation({ to: FACILITY_RESOURCE, system: true, open: 'page', texts: { label: 'Facility', doc: { summary: 'The site of the terminal.' } } }),
  result: enumField(TERMINAL_SYNC_RESULTS, TERMINAL_SYNC_RESULT_ENUM, {
    system: true,
    texts: { label: 'Result', doc: { summary: 'Whether the terminal received the rule set.' } },
  }),
  epoch: f.number({
    system: true,
    texts: {
      label: 'Epoch',
      doc: { summary: 'The version of the organization’s rule set pushed: it goes up with every change to policies, grants, overrides or the people they name.' },
    },
  }),
  urgent: f.boolean({
    system: true,
    texts: { label: 'Urgent', doc: { summary: 'Pushed because access narrowed (a deny, a revocation, an override): terminals must have it within the revocation bound.' } },
  }),
  forced: f.boolean({
    system: true,
    texts: { label: 'Published by hand', doc: { summary: 'Pushed by “Publish policy to terminals” rather than by the automatic sync.' } },
  }),
  error: f.string({ system: true, nullable: true, texts: { label: 'Error', doc: { summary: 'Why the push failed or the terminal was unreachable.' } } }),
  checksum: f.string({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Checksum', doc: { summary: 'Fingerprint (SHA-256) of the rule set delivered: equal checksums mean the same content.' } },
  }),
  size_bytes: f.number({ system: true, nullable: true, in: ['show'], texts: { label: 'Size (bytes)', doc: { summary: 'Size of the rule set delivered.' } } }),
  duration_ms: f.number({ system: true, nullable: true, in: ['show'], texts: { label: 'Duration (ms)', doc: { summary: 'How long building and delivering the push took.' } } }),
};

/**
 * Terminal sync log (`itap.terminal_policy_syncs`): every push of the access rule set to a
 * terminal, newest first: append-only, no create, edit or delete, keyset paging, no count on every
 * page. The sidebar facility narrows it.
 */
export const terminalPolicySync = defineResource(TERMINAL_POLICY_SYNC_RESOURCE, {
  texts: {
    label: 'Terminal sync',
    labelPlural: 'Terminal sync log',
    doc: {
      summary: 'One push of the access rule set to an access terminal: when, which epoch, whether it arrived, and why not. Never changed.',
    },
  },
  basePath: '/terminal-syncs',
  section: NAV_SECTIONS.access,
  order: 70,
  icon: NAV_ICONS.terminalSyncLog,
  displayField: 'created_at',
  recordTitle: (record) => recordDate('Terminal sync at', record.created_at),
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: terminalPolicySyncFields,
  views: {
    list: {
      columns: ['created_at', 'device_id', 'result', 'epoch', 'urgent', 'forced', 'error'],
      optionalColumns: ['facility_id'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: SYNC_PAGE_SIZE,
      filters: { pinned: ['result', 'device_id', 'created_at'], fields: ['result', 'device_id', 'facility_id', 'urgent', 'forced', 'created_at'] },
      savedViews: [
        { id: 'not-synced', texts: 'Not delivered', state: { filters: [{ field: 'result', op: 'ne', value: 'synced' }] } },
        { id: 'published', texts: 'Published by hand', state: { filters: [{ field: 'forced', op: 'eq', value: true }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['created_at', 'device_id', 'result', 'epoch'])],
      body: (l) => [l.grid(['facility_id', 'urgent', 'forced']), 'error', l.grid(['checksum', 'size_bytes', 'duration_ms'])],
    },
  },
});

/** The log columns of a terminal's own list (its device page). */
export const DEVICE_SYNC_COLUMNS = ['created_at', 'result', 'epoch', 'urgent', 'forced', 'error'] as const;
