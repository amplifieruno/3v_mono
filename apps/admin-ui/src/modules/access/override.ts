import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { EMERGENCY_OVERRIDE_RESOURCE, FACILITY_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { OVERRIDE_MODES, OVERRIDE_MODE_ENUM } from '../../enums/access';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';

/** The modes as a record title says them (the enum's labels). */
const MODE_TITLES: Readonly<Record<string, string>> = { lock_all: 'Lock all', unlock_all: 'Unlock all', evacuation: 'Evacuation' };

const member = (label: string, summary: string) =>
  f.relation({ to: USER_RESOURCE, system: true, nullable: true, in: ['list', 'show'], open: 'none', texts: { label, doc: { summary } } });

/**
 * Columns of `itap.emergency_overrides` the `org_admin` role reads. Read only here: overrides
 * are started and ended only through `start_emergency_override` / `end_emergency_override`.
 */
export const emergencyOverrideFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    system: true,
    open: 'page',
    texts: { label: 'Facility', doc: { summary: 'The site whose doors the override covers (all of them, or only those of its areas).' } },
  }),
  mode: enumField(OVERRIDE_MODES, OVERRIDE_MODE_ENUM, {
    system: true,
    texts: {
      label: 'Mode',
      doc: { summary: 'Lock all, unlock all, or evacuation (exits open). An override decides before any policy or grant.' },
    },
  }),
  justification: f.text({
    system: true,
    in: ['show'],
    texts: { label: 'Justification', doc: { summary: 'Why the override was started, as given by the member who started it.' } },
  }),
  started_by: member('Started by', 'The member who started the override.'),
  started_at: dateTime({ system: true, texts: { label: 'Started', doc: { summary: 'From this moment on the override decides at the doors it covers.' } } }),
  ends_at: dateTime({
    system: true,
    texts: { label: 'Ends', doc: { summary: 'When the override ends by itself (at most 24 hours after its start).' } },
  }),
  ended_at: dateTime({
    system: true,
    texts: { label: 'Ended early', doc: { summary: 'When a member ended the override before its planned end; empty otherwise.' } },
  }),
  ended_by: member('Ended by', 'The member who ended the override early.'),
  end_reason: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'End reason', doc: { summary: 'Why the override was ended before its planned end.' } },
  }),
};

/**
 * Emergency overrides (`itap.emergency_overrides`), read only: an access decision links the
 * override that decided it. Starting and ending them is added with the terminals (plan 10
 * task 3). The sidebar facility narrows the list.
 */
export const emergencyOverride = defineResource(EMERGENCY_OVERRIDE_RESOURCE, {
  texts: {
    label: 'Emergency override',
    labelPlural: 'Emergency overrides',
    doc: {
      summary:
        'A facility-wide lock, unlock or evacuation for a limited time that decides at its doors before any policy or grant, with its justification.',
    },
  },
  basePath: '/emergency-overrides',
  section: NAV_SECTIONS.access,
  order: 50,
  icon: NAV_ICONS.emergencyOverrides,
  displayField: 'started_at',
  recordTitle: (record) => (typeof record.mode === 'string' ? `Emergency override: ${MODE_TITLES[record.mode] ?? record.mode}` : null),
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: emergencyOverrideFields,
  views: {
    list: {
      columns: ['started_at', 'facility_id', 'mode', 'ends_at', 'ended_at', 'started_by'],
      defaultSort: [{ field: 'started_at', direction: 'desc' }],
      filters: { pinned: ['facility_id', 'mode'], fields: ['facility_id', 'mode', 'started_at'] },
    },
    show: {
      header: (l) => [l.grid(['facility_id', 'mode', 'started_at', 'ends_at'])],
      body: (l) => [
        'justification',
        l.grid(['started_by', 'started_at', 'ends_at']),
        l.panel([l.grid(['ended_by', 'ended_at']), 'end_reason'], { key: 'ended', when: l.present(l.ref('record', 'ended_at')) }),
      ],
    },
  },
});
