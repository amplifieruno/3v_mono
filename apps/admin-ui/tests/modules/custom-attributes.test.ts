import { describeScreen } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { CUSTOM_ATTRIBUTE_ENTITIES, CUSTOM_ATTRIBUTE_TYPES } from '../../src/enums/organization';
import { ITAP_TABLES } from '../../src/modules';
import {
  customAttributeDefinition,
  customAttributeFields,
} from '../../src/modules/organization/custom-attributes';
import { preferencesPage } from '../../src/modules/organization/preferences-page';
import {
  USER_SETTINGS_RESOURCE,
  userSettings,
  userSettingsFields,
} from '../../src/modules/organization/user-settings';
import { issueText } from '../support/field-issues';
import { CUSTOM_ATTRIBUTE_RESOURCE } from '../../src/data/resource-names';

/**
 * Custom attribute definitions (the schema of `custom_fields` per entity): options only
 * for the select type and required there, key and entity fixed after create, the
 * org_admin write columns as the active fields. User preferences: the signed-in
 * user's own `user_settings` row (locale, time zone) on a page of its own.
 */

/** The `org_admin` insert columns of `itap.custom_attribute_definitions` (Hasura metadata). */
const INSERT_COLUMNS = [
  'data_type',
  'entity',
  'is_active',
  'key',
  'label',
  'options',
  'required',
  'sort_order',
  'validation',
  'visible_when',
];
/** The `org_admin` update columns: no `entity`, no `key`. */
const UPDATE_COLUMNS = INSERT_COLUMNS.filter((name) => name !== 'entity' && name !== 'key');

type Validator = (value: unknown) => unknown;

function validatorOf(field: { readonly opts: unknown }): Validator {
  const validate = (field.opts as { validate?: unknown }).validate;
  if (typeof validate === 'function') {
    return (value) => issueText((validate as Validator)(value));
  }
  const standard = (validate as { '~standard'?: { validate: (v: unknown) => unknown } })?.[
    '~standard'
  ];
  if (standard === undefined) throw new Error('no validator');
  return (value) => {
    const result = standard.validate(value) as { issues?: readonly { message: string }[] };
    return result.issues === undefined ? null : result.issues[0]?.message;
  };
}

function statuses(mode: 'create' | 'edit' | 'show', values: Record<string, unknown>) {
  const screen = describeScreen(customAttributeDefinition, mode, {
    // Show reads the record, the forms their live values.
    sources: mode === 'show' ? { record: values } : { values },
  });
  expect(screen.issues).toEqual([]);
  return screen.fields;
}

function active(fields: Readonly<Record<string, string>>): string[] {
  return Object.entries(fields)
    .filter(([, status]) => status === 'active')
    .map(([name]) => name)
    .sort();
}

beforeAll(async () => {
  await app.ready;
});

describe('custom attribute definitions', () => {
  it('should take the entity and data type values of the enum tables', () => {
    expect(CUSTOM_ATTRIBUTE_ENTITIES).toEqual(['profile', 'identity', 'facility', 'device']);
    expect(CUSTOM_ATTRIBUTE_TYPES).toEqual(['string', 'number', 'boolean', 'date', 'enum']);
    expect(customAttributeFields.data_type.opts.default).toBe('string');
  });

  it('should list by entity and sort order, searchable by label and key', () => {
    const list = (
      app.registry.get(CUSTOM_ATTRIBUTE_RESOURCE) as {
        views?: { list?: { columns?: unknown; search?: unknown; filters?: unknown } };
      }
    ).views?.list;
    expect(list?.columns).toEqual(['entity', 'label', 'key', 'data_type', 'required', 'is_active']);
    expect(list?.search).toEqual({ fields: ['label', 'key'] });
    expect(list?.filters).toEqual({ fields: ['entity', 'data_type', 'is_active'] });
  });

  it('should map itap.custom_attribute_definitions and select every declared column', () => {
    expect(ITAP_TABLES[CUSTOM_ATTRIBUTE_RESOURCE]).toMatchObject({
      table: 'custom_attribute_definitions',
      selectFields: Object.keys(customAttributeFields),
    });
  });

  it('should keep options off the form for a text attribute', () => {
    for (const mode of ['create', 'edit', 'show'] as const) {
      const fields = statuses(mode, { data_type: 'string', options: null });
      expect(fields.options, mode).toBe('inactive');
    }
  });

  it('should require options for a select attribute', () => {
    for (const mode of ['create', 'edit'] as const) {
      expect(statuses(mode, { data_type: 'enum' }).options, mode).toBe('active');
    }
    expect(statuses('show', { data_type: 'enum', options: ['day'] }).options).toBe('readonly');
    expect(customAttributeFields.options.opts.required).toBe(true);
  });

  it('should write exactly the org_admin insert columns on create and update columns on edit', () => {
    expect(active(statuses('create', { data_type: 'enum' }))).toEqual(INSERT_COLUMNS);
    expect(active(statuses('edit', { data_type: 'enum' }))).toEqual(UPDATE_COLUMNS);
  });

  it('should not let the key or the entity change after create', () => {
    const fields = statuses('edit', { data_type: 'string', key: 'badge_number' });
    expect(fields.key).not.toBe('active');
    expect(fields.entity).not.toBe('active');
    expect(customAttributeFields.key.opts.write).toBe('create');
    expect(customAttributeFields.entity.opts.write).toBe('create');
  });

  it('should refuse a key the database refuses', () => {
    const validate = validatorOf(customAttributeFields.key);
    expect(validate('badge_number')).toBeNull();
    expect(validate('b')).toBeNull();
    for (const bad of ['Badge', '1st', 'badge-number', '_x', 'a'.repeat(64), 'with space']) {
      expect(validate(bad), bad).toBe(
        'Use lowercase letters, digits and underscores, starting with a letter (at most 63 characters).',
      );
    }
  });

  it('should refuse an option list the custom field check could not match', () => {
    const validate = validatorOf(customAttributeFields.options);
    expect(validate(['day', 'night'])).toBeNull();
    expect(validate([])).toBe('Add at least one option.');
    expect(validate(['day', ' '])).toBe('Option 2 is empty.');
    expect(validate(['day', 'day'])).toBe('Option 2 repeats option 1.');
    expect(validate(['day', 3])).toBe('Option 2 is not text.');
    expect(validate({ day: true })).toBe('Options must be a list.');
  });

  it('should accept only an object or nothing as the reserved validation and visibility rules', () => {
    for (const field of [customAttributeFields.validation, customAttributeFields.visible_when]) {
      const validate = validatorOf(field);
      expect(validate(null)).toBeNull();
      expect(validate({ min: 1 })).toBeNull();
      expect(validate([1])).toBe(
        'Enter a JSON object, such as {"max_length": 20}, or leave it empty.',
      );
      expect(validate('x')).toBe(
        'Enter a JSON object, such as {"max_length": 20}, or leave it empty.',
      );
    }
  });
});

describe('user preferences', () => {
  it('should register the preferences page in the organization section', () => {
    const page = app.registry.customPages
      .list()
      .find((entry) => entry.name === preferencesPage.name) as
      | { path?: string; section?: string }
      | undefined;
    expect(page?.path).toBe('/preferences');
    expect(page?.section).toBe('organization');
  });

  it('should map itap.user_settings by user id and make locale and time zone editable', () => {
    expect(ITAP_TABLES[USER_SETTINGS_RESOURCE]).toMatchObject({
      table: 'user_settings',
      pkField: 'user_id',
      selectFields: Object.keys(userSettingsFields),
    });
    for (const mode of ['create', 'edit'] as const) {
      const screen = describeScreen(userSettings, mode, { sources: { record: {} } });
      expect(active(screen.fields), mode).toEqual(['locale', 'timezone']);
    }
    expect(userSettingsFields.timezone.ui).toMatchObject({ input: 'itap.timezone' });
    const title = (
      app.registry.get(USER_SETTINGS_RESOURCE) as { recordTitle: (r: unknown) => string }
    ).recordTitle;
    expect(title({ locale: 'de', timezone: 'Europe/Berlin' })).toBe('de · Europe/Berlin');
    expect(title({ locale: null, timezone: null })).toBe('— · —');
  });

  it('should accept the locale shapes notification templates use', () => {
    const validate = validatorOf(userSettingsFields.locale);
    for (const good of ['en', 'ru', 'de-AT', 'zh-Hant', null, '']) {
      expect(validate(good), String(good)).toBeNull();
    }
    for (const bad of ['EN', 'english', 'e', 'de_AT']) {
      expect(validate(bad), bad).toBe('Enter a language code such as en, ru or de-AT.');
    }
  });
});
