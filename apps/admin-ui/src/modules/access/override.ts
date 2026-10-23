import { defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { EMERGENCY_OVERRIDE_AREA_RESOURCE, EMERGENCY_OVERRIDE_RESOURCE, FACILITY_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { OVERRIDE_MODES, OVERRIDE_MODE_ENUM, OVERRIDE_MODE_TEXTS } from '../../enums/access';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { decisionsList } from './access-tabs';
import { OVERRIDE_RULES, endOverrideFlow, startOverrideFlow } from './override-flows';
import { terminalSyncBlock } from './terminal-sync-block';

/** An override's record title: "Emergency override: <mode label>" (the enum's labels). */
export function overrideTitle(mode: unknown): string | null {
  if (typeof mode !== 'string') return null;
  const texts = (OVERRIDE_MODE_TEXTS as Readonly<Record<string, { readonly label: string }>>)[mode];
  return `Emergency override: ${texts?.label ?? mode}`;
}

const member = (label: string, summary: string) =>
  f.relation({ to: USER_RESOURCE, system: true, nullable: true, in: ['list', 'show'], open: 'none', texts: { label, doc: { summary } } });

/**
 * Columns of `itap.emergency_overrides` the `org_admin` role reads. Never written directly:
 * overrides are started and ended only through `start_emergency_override` /
 * `end_emergency_override` (and closed by the minute job once they run out).
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
    texts: {
      label: 'Ended',
      doc: { summary: 'When the override stopped deciding: ended early by a member, or closed at its planned end; empty while it is active.' },
    },
  }),
  ended_by: member('Ended by', 'The member who ended the override early; empty when it ran out.'),
  end_reason: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'End reason', doc: { summary: 'Why the override was ended early (“expired” when it ran out).' } },
  }),
};

/**
 * Emergency overrides (`itap.emergency_overrides`): a facility-wide (or area-limited) lock,
 * unlock or evacuation for a limited time that decides at its doors before any policy or grant.
 * "Start override" on the list, "End now" (with a reason) on an active one; never edited or
 * deleted. Its page shows the areas, the facility's terminals picking it up (and its end), and
 * the decisions it made. The sidebar facility narrows the list; the shell's banner shows the
 * active ones.
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
  recordTitle: (record) => overrideTitle(record.mode),
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: emergencyOverrideFields,
  rules: OVERRIDE_RULES,
  actions: (r) => ({
    resource: [r.action.flow('start', startOverrideFlow)],
    item: [r.action.flow('end', endOverrideFlow)],
  }),
  views: {
    list: {
      columns: ['started_at', 'facility_id', 'mode', 'ends_at', 'ended_at', 'started_by'],
      defaultSort: [{ field: 'started_at', direction: 'desc' }],
      filters: { pinned: ['facility_id', 'mode'], fields: ['facility_id', 'mode', 'started_at', 'ended_at'] },
      savedViews: [
        { id: 'active', texts: 'Active', state: { filters: [{ field: 'ended_at', op: 'isNull' }] } },
        { id: 'ended', texts: 'Ended', state: { filters: [{ field: 'ended_at', op: 'isNotNull' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['facility_id', 'mode', 'started_at', 'ends_at'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                'justification',
                l.grid(['started_by', 'started_at', 'ends_at']),
                l.panel([l.grid(['ended_by', 'ended_at']), 'end_reason'], { key: 'ended', when: l.present(l.ref('record', 'ended_at')) }),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(EMERGENCY_OVERRIDE_AREA_RESOURCE)), {
                  key: 'override-areas',
                  texts: { title: 'Limited to these areas (none: the whole facility)' },
                  props: { where: [{ field: 'override_id', op: 'eq', value: l.ref('record', 'id') }], columns: ['area_id'], open: 'none' },
                }),
              ],
              { key: 'areas', texts: 'Areas' },
            ),
            l.panel(
              [
                l.place(terminalSyncBlock, {
                  key: 'override-terminals',
                  props: {
                    facilityId: l.ref('record', 'facility_id'),
                    startedAt: l.ref('record', 'started_at'),
                    endedAt: l.ref('record', 'ended_at'),
                  },
                }),
              ],
              { key: 'terminals', texts: 'Terminals' },
            ),
            l.panel([decisionsList(l, 'override-decisions', 'override_id')], { key: 'decisions', texts: 'Decisions' }),
          ],
          { key: 'sections' },
        ),
      ],
    },
  },
});
