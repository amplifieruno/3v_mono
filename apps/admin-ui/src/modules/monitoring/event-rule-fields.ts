import { f } from '@burojs/field-types';
import { EVENT_RULE_VERSION_RESOURCE } from '../../data/resource-names';
import { EVENT_RULE_TYPES, EVENT_RULE_TYPE_ENUM } from '../../enums/events';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { checkNotBlank } from '../../fields/not-blank';

const RULE_TYPE_TEXTS = {
  label: 'Rule type',
  doc: {
    summary:
      'What the rule watches for: after hours, loitering, unusual dwell, occupancy, restricted areas, inactive people, watch lists, tailgating, first visits or abnormal movement. Chosen when the rule is created; it decides which parameters its versions take.',
  },
};

/** The rule's type: chosen once, when the rule is created. */
export const ruleTypeField = enumField(EVENT_RULE_TYPES, EVENT_RULE_TYPE_ENUM, {
  required: true,
  write: 'create',
  texts: RULE_TYPE_TEXTS,
});

/** A version's rule type (computed from its rule): what its parameters editor shows. */
export const versionRuleTypeField = enumField(EVENT_RULE_TYPES, EVENT_RULE_TYPE_ENUM, {
  system: true,
  in: ['show', 'edit'],
  texts: RULE_TYPE_TEXTS,
});

/** Columns of `itap.event_rules` the `org_admin` role reads; name, description and enabled are edited. */
export const eventRuleFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: ['list', 'show', 'edit'],
    texts: { label: 'Code', doc: { summary: 'The rule’s number in the organization (RULE-00004), given on creation.' } },
  }),
  name: f.string({ required: true, validate: checkNotBlank(), texts: 'Name' }),
  description: f.text({ nullable: true, texts: 'Description' }),
  rule_type: ruleTypeField,
  is_enabled: f.boolean({
    default: true,
    texts: {
      label: 'Enabled',
      doc: {
        summary:
          'A disabled rule matches no event; its versions and history stay. Disable a rule instead of deleting it once it has raised events.',
      },
    },
  }),
  current_version_id: f.relation({
    to: EVENT_RULE_VERSION_RESOURCE,
    system: true,
    nullable: true,
    in: ['list', 'show'],
    open: 'page',
    providerOptions: { relationship: 'current_version' },
    texts: {
      label: 'Version in force',
      doc: {
        summary:
          'The published version events are evaluated against; empty until a first version is published. Changed only by publishing a version.',
      },
    },
  }),
  last_triggered_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Last triggered', doc: { summary: 'When the rule last matched an event.' } },
  }),
  trigger_count: f.number({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Times triggered', doc: { summary: 'How many events the rule has matched, over every version.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
