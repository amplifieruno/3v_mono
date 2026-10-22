import { type Layout, defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import {
  CUSTOM_ATTRIBUTE_ENTITIES,
  CUSTOM_ATTRIBUTE_ENTITY_ENUM,
  CUSTOM_ATTRIBUTE_TYPES,
  CUSTOM_ATTRIBUTE_TYPE_ENUM,
} from '../../enums/organization';
import { enumField } from '../../enums/field';
import { rangeValidator } from '../../fields/bounded-number';
import { stringList } from '../../fields/string-list';

export const CUSTOM_ATTRIBUTE_RESOURCE = 'custom_attribute_definition';

/** The data type whose values are picked from `options` (the database CHECK requires them there). */
export const SELECT_TYPE = 'enum';

/** `custom_attribute_definitions_key_format`: `^[a-z][a-z0-9_]{0,62}$`. */
const KEY_FORMAT = /^[a-z][a-z0-9_]{0,62}$/;

const checkKey = (value: unknown): string | null =>
  value === null ||
  value === undefined ||
  value === '' ||
  (typeof value === 'string' && KEY_FORMAT.test(value))
    ? null
    : 'Use lowercase letters, digits and underscores, starting with a letter (at most 63 characters).';

/**
 * `validation` and `visible_when` are free-form `jsonb` the database stores without
 * reading (reserved for later rules); the console keeps them to an object or nothing.
 */
const checkObject = (value: unknown): string | null =>
  value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value))
    ? null
    : 'Enter a JSON object, such as {"max_length": 20}, or leave it empty.';

/** `int4` bounds of `sort_order` (no CHECK on the column), restated as `validate` (G14). */
const INT4 = { min: -2147483648, max: 2147483647, integer: true } as const;

/** Columns of `itap.custom_attribute_definitions` the `org_admin` role reads; the module's `index.ts` mapping selects these. */
export const customAttributeFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  entity: enumField(CUSTOM_ATTRIBUTE_ENTITIES, CUSTOM_ATTRIBUTE_ENTITY_ENUM, {
    required: true,
    default: 'profile',
    write: 'create',
    texts: {
      label: 'Applies to',
      doc: {
        summary:
          'The kind of record the attribute is added to: profiles, identities, facilities or devices. Fixed after create.',
      },
    },
  }),
  key: f.string({
    required: true,
    write: 'create',
    validate: checkKey,
    texts: {
      label: 'Key',
      description: 'Lowercase letters, digits and underscores, such as badge_number.',
      doc: {
        summary:
          'The name the value is stored under in the record’s custom fields and the name segment conditions and exports use (`custom_fields.<key>`). Unique per entity; fixed after create.',
      },
    },
  }),
  label: f.string({ required: true, texts: 'Label' }),
  data_type: enumField(CUSTOM_ATTRIBUTE_TYPES, CUSTOM_ATTRIBUTE_TYPE_ENUM, {
    required: true,
    default: 'string',
    texts: {
      label: 'Data type',
      doc: {
        summary:
          'What a value must be: text, a number, yes/no, a date (YYYY-MM-DD) or one of the options (select). The database refuses a record whose value does not match.',
      },
    },
  }),
  options: stringList({
    item: 'Option',
    required: true,
    nullable: true,
    texts: {
      label: 'Options',
      description: 'The values a select attribute offers; a value must match one exactly.',
      doc: {
        summary:
          'The allowed values of a select attribute, in display order. Only shown and required for the select type; renaming an option does not change values already stored.',
      },
    },
  }),
  required: f.boolean({
    default: false,
    texts: {
      label: 'Required',
      doc: {
        summary:
          'Records of this entity cannot be saved with custom fields that leave it empty. Existing records are checked only when their custom fields change.',
      },
    },
  }),
  validation: f.json({
    nullable: true,
    validate: checkObject,
    texts: {
      label: 'Validation rules',
      doc: {
        summary:
          'Reserved: extra rule parameters as a JSON object, stored but not enforced yet. Leave empty.',
      },
    },
  }),
  visible_when: f.json({
    nullable: true,
    validate: checkObject,
    texts: {
      label: 'Visible when',
      doc: {
        summary:
          'Reserved: a condition, as a JSON object, under which forms will show the attribute; stored but not applied yet. Leave empty.',
      },
    },
  }),
  sort_order: f.number({
    required: true,
    default: 0,
    integer: true,
    validate: rangeValidator(INT4),
    texts: {
      label: 'Sort order',
      doc: { summary: 'Attributes are listed on a record by this number, lowest first.' },
    },
  }),
  is_active: f.boolean({
    default: true,
    texts: {
      label: 'Active',
      doc: {
        summary:
          'An inactive attribute is no longer checked or offered; values already stored under its key are kept and still accepted.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

type Fields = typeof customAttributeFields;

/** The form and show trees: options only for the select type, read from `source` (`values` or `record`). */
function body(l: Layout<Fields>, source: 'values' | 'record') {
  return [
    'entity',
    'key',
    'label',
    'data_type',
    l.field('options', { when: l.equals(l.ref(source, 'data_type'), SELECT_TYPE) }),
    'required',
    'sort_order',
    'is_active',
    l.panel(['validation', 'visible_when'], {
      key: 'reserved',
      texts: 'Reserved rules',
      collapse: 'closed',
    }),
  ] as const;
}

/**
 * Custom attribute definitions: the organization's own extra fields of profiles,
 * identities, facilities and devices, stored in each record's `custom_fields` and
 * checked by the database (`itap.validate_custom_fields`) on every write of them.
 */
export const customAttributeDefinition = defineResource(CUSTOM_ATTRIBUTE_RESOURCE, {
  texts: {
    label: 'Custom attribute',
    labelPlural: 'Custom attributes',
    doc: {
      summary:
        'An extra field the organization adds to profiles, identities, facilities or devices, such as a badge number or a shift. Values are stored with the record and checked against the definition on save.',
    },
  },
  basePath: '/custom-attributes',
  section: NAV_SECTIONS.organization,
  order: 70,
  icon: NAV_ICONS.customAttributes,
  displayField: 'label',
  data: { provider: 'hasura' },
  fields: customAttributeFields,
  views: {
    list: {
      columns: ['entity', 'label', 'key', 'data_type', 'required', 'is_active'],
      defaultSort: [
        { field: 'entity', direction: 'asc' },
        { field: 'sort_order', direction: 'asc' },
      ],
      search: { fields: ['label', 'key'] },
      filters: { fields: ['entity', 'data_type', 'is_active'] },
    },
    show: {
      body: (l) => [
        ...body(l, 'record'),
        l.panel(['created_at', 'updated_at'], {
          key: 'record',
          texts: 'Record',
          collapse: 'closed',
        }),
      ],
    },
    create: { body: (l) => body(l, 'values') },
    edit: { body: (l) => body(l, 'values') },
  },
});
