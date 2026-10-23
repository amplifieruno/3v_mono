import { defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { LEGAL_HOLD_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';
import { endHoldFlow } from './legal-hold-flows';
import { LEGAL_HOLD_CHECKS, LEGAL_HOLD_RULES } from './legal-hold-rules';
import { HOLD_TARGETS } from './legal-hold-targets';

/** Columns of `itap.legal_holds` the `org_admin` role reads and writes (no delete permission). */
export const legalHoldFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  name: f.text({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Name', doc: { summary: 'What the hold is for, as people will find it, such as "Litigation Smith v. Nova Tower".' } },
  }),
  reason: f.text({
    required: true,
    validate: checkNotBlank(),
    texts: { label: 'Reason', doc: { summary: 'Why the data must be kept: the claim, investigation or authority request, with its reference.' } },
  }),
  starts_at: dateTime({
    required: true,
    texts: {
      label: 'Starts',
      doc: { summary: 'From this moment the hold keeps what it covers. Once it has started it can no longer move.' },
    },
  }),
  ends_at: dateTime({
    texts: {
      label: 'Ends',
      doc: {
        summary:
          'When the hold stops keeping data; empty for until further notice. Once the hold has started, the end can be set or moved earlier, never later or away.',
      },
    },
  }),
  created_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['list', 'show'],
    open: 'none',
    texts: { label: 'Created by', doc: { summary: 'The member who created the hold.' } },
  }),
  created_at: f.dateTime({ system: true, in: ['list', 'show'], texts: { label: 'Created', doc: { summary: 'When the hold was created.' } } }),
};

/**
 * Legal holds (`itap.legal_holds` with their targets): while a hold is in force
 * (`[starts_at, ends_at)`), the nightly retention run keeps every row about what it covers
 * (people through their identities and merges, identities, incidents, facilities), and an erasure
 * request completes partially. The start of a started hold is never offered as an input; its end
 * only set or shortened; an ended hold's dates are frozen. Never deleted (no permission): a hold
 * is ended, and stays as history. Held profiles, identities and incidents say so on their pages.
 */
export const legalHold = defineResource(LEGAL_HOLD_RESOURCE, {
  texts: {
    label: 'Legal hold',
    labelPlural: 'Legal holds',
    doc: {
      summary:
        'Keeps the data about named people, identities, incidents or facilities from retention and erasure while it is in force, for a claim, an investigation or an authority request.',
    },
  },
  basePath: '/legal-holds',
  section: NAV_SECTIONS.compliance,
  order: 40,
  icon: NAV_ICONS.legalHolds,
  displayField: 'name',
  data: { provider: 'hasura' },
  operations: { delete: false },
  builtinActions: { delete: false },
  fields: legalHoldFields,
  rules: LEGAL_HOLD_RULES,
  checks: LEGAL_HOLD_CHECKS,
  actions: (r) => ({ item: [r.action.flow('end_now', endHoldFlow)] }),
  views: {
    list: {
      columns: ['name', 'starts_at', 'ends_at', 'created_by', 'created_at'],
      defaultSort: [{ field: 'starts_at', direction: 'desc' }],
      search: { fields: [{ field: 'name', op: 'contains' }] },
      filters: { pinned: ['starts_at', 'ends_at'], fields: ['starts_at', 'ends_at', 'created_at'] },
      savedViews: [
        { id: 'open-ended', texts: 'Until further notice', state: { filters: [{ field: 'ends_at', op: 'isNull' }] } },
        { id: 'with-end', texts: 'With an end', state: { filters: [{ field: 'ends_at', op: 'isNotNull' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['starts_at', 'ends_at'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(['name', 'reason', l.grid(['created_by', 'created_at'])], { key: 'details', texts: 'Details' }),
            ...HOLD_TARGETS.map((spec) =>
              l.panel(
                [
                  l.place(relatedList(resourceByName(spec.resource)), {
                    key: `hold-${spec.column}`,
                    texts: { title: spec.labelPlural },
                    // Also seeds "+ Create": the new target is for this hold; the form asks for the target.
                    props: {
                      where: [
                        { field: 'hold_id', op: 'eq', value: l.ref('record', 'id') },
                        { field: spec.column, op: 'nnull', value: true },
                      ],
                      columns: [spec.column, 'created_at'],
                      open: 'none',
                    },
                  }),
                ],
                { key: spec.column.replace('_id', 's'), texts: spec.title },
              ),
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    create: { body: (l) => ['name', 'reason', l.grid(['starts_at', 'ends_at'])] },
    edit: { body: (l) => ['name', 'reason', l.grid(['starts_at', 'ends_at'])] },
  },
});
