import { afterEach, describe, expect, it } from 'vitest';
import { customFields } from '../../src/fields/custom-fields';
import {
  type AttributeDefinition,
  activeDefinitions,
  keptKeys,
  validateCustomFields,
  withAttribute,
} from '../../src/fields/custom-fields-check';
import { publishCustomFields } from '../../src/fields/custom-fields-registry';
import { expectTranslated, issueText, validatorResult } from '../support/field-issues';

/**
 * The `customFields({ entity })` field: values of the organization's custom attributes
 * in a record's `custom_fields`, checked as `itap.validate_custom_fields` checks them
 * (object; no key without a definition; active required ones present; values of the
 * definition's type), unchanged values of an existing record not checked at all.
 */

const def = (over: Partial<AttributeDefinition> & Pick<AttributeDefinition, 'key'>) =>
  ({
    label: over.key,
    data_type: 'string',
    options: null,
    required: false,
    is_active: true,
    sort_order: 0,
    ...over,
  }) satisfies AttributeDefinition;

const PERMIT = def({ key: 'fire_permit', label: 'Fire permit', required: true, sort_order: 10 });
const FLOORS = def({ key: 'floors', label: 'Floors', data_type: 'number', sort_order: 20 });
const OPENED = def({ key: 'opened', label: 'Opened', data_type: 'date', sort_order: 30 });
const GUARDED = def({ key: 'guarded', label: 'Guarded', data_type: 'boolean', sort_order: 40 });
const TIER = def({ key: 'tier', label: 'Tier', data_type: 'enum', options: ['A', 'B'], sort_order: 5 });
const LEGACY = def({ key: 'legacy_code', label: 'Legacy code', required: true, is_active: false });
const DEFINITIONS = [PERMIT, FLOORS, OPENED, GUARDED, TIER, LEGACY];

const VALID = { fire_permit: 'FP-1', floors: 12, opened: '2024-02-29', guarded: true, tier: 'A' };

describe('validateCustomFields (mirrors itap.validate_custom_fields)', () => {
  it('should accept values of every type and an empty optional attribute', () => {
    expect(validateCustomFields(VALID, DEFINITIONS)).toBeNull();
    expect(validateCustomFields({ fire_permit: 'FP-1', floors: null }, DEFINITIONS)).toBeNull();
  });

  it('should refuse anything but an object', async () => {
    for (const value of [null, [], 'x', 3]) {
      expect(validateCustomFields(value, DEFINITIONS)?.code, JSON.stringify(value)).toBe(
        'customFields.notObject',
      );
    }
    const problem = validateCustomFields([], DEFINITIONS);
    if (problem === null) throw new Error('expected a refusal');
    await expectTranslated(problem);
  });

  it('should refuse a missing or null required attribute and name it', async () => {
    for (const value of [{}, { fire_permit: null }]) {
      const problem = validateCustomFields(value, DEFINITIONS);
      expect(problem).toMatchObject({ code: 'customFields.required', params: { label: 'Fire permit' } });
      if (problem !== null) expect(await expectTranslated(problem)).toBe('Fire permit is required.');
    }
  });

  it('should refuse a value of the wrong type', async () => {
    const wrong: readonly [Record<string, unknown>, string][] = [
      [{ fire_permit: 7 }, 'customFields.notText'],
      [{ floors: '12' }, 'customFields.notNumber'],
      [{ opened: '2023-02-29' }, 'customFields.notDate'],
      [{ opened: '2024-2-1' }, 'customFields.notDate'],
      [{ guarded: 'yes' }, 'customFields.notBoolean'],
      [{ tier: 'C' }, 'customFields.notOption'],
    ];
    for (const [patch, code] of wrong) {
      const problem = validateCustomFields({ ...VALID, ...patch }, DEFINITIONS);
      expect(problem?.code, JSON.stringify(patch)).toBe(code);
      if (problem !== null) await expectTranslated(problem);
    }
  });

  it('should keep and accept values of inactive attributes without checking them', () => {
    expect(validateCustomFields({ ...VALID, legacy_code: 42 }, DEFINITIONS)).toBeNull();
  });

  it('should refuse a key no attribute defines (the database refuses it on write)', async () => {
    const problem = validateCustomFields({ ...VALID, removed_attr: 'x' }, DEFINITIONS);
    expect(problem).toMatchObject({ code: 'customFields.undefinedKey', params: { key: 'removed_attr' } });
    if (problem !== null) await expectTranslated(problem);
  });
});

describe('definitions and values', () => {
  it('should offer only active attributes, by sort order', () => {
    expect(activeDefinitions(DEFINITIONS).map((d) => d.key)).toEqual([
      'tier',
      'fire_permit',
      'floors',
      'opened',
      'guarded',
    ]);
  });

  it('should list the stored keys no active attribute offers', () => {
    expect(keptKeys({ ...VALID, legacy_code: 'L', removed_attr: 1 }, DEFINITIONS)).toEqual([
      { key: 'legacy_code', definition: LEGACY },
      { key: 'removed_attr', definition: null },
    ]);
  });

  it('should set or clear one attribute and keep every other key untouched', () => {
    const stored = { legacy_code: 'L', removed_attr: 1, floors: 3 };
    expect(withAttribute(stored, 'fire_permit', 'FP')).toEqual({ ...stored, fire_permit: 'FP' });
    expect(withAttribute(stored, 'floors', undefined)).toEqual({ legacy_code: 'L', removed_attr: 1 });
    expect(withAttribute(null, 'floors', 2)).toEqual({ floors: 2 });
  });
});

describe('customFields field', () => {
  let unpublish: (() => void) | undefined;
  afterEach(() => unpublish?.());

  it('should be a json field rendered by the itap.custom-fields implementation', () => {
    const field = customFields({ entity: 'facility', texts: 'Custom fields' });
    expect(field.kind).toBe('json');
    expect(field.ui).toMatchObject({ input: 'itap.custom-fields', display: 'itap.custom-fields' });
    expect(field.meta).toEqual({ entity: 'facility' });
  });

  it('should check against the definitions its input loaded', async () => {
    const field = customFields({ entity: 'facility' });
    // Before the input loaded any definitions, only the shape is checked; the server decides.
    expect(await validatorResult(field.opts.validate, {})).toBeNull();
    expect(issueText(await validatorResult(field.opts.validate, []))).toMatch(/object/);

    unpublish = publishCustomFields('facility', { definitions: DEFINITIONS });
    expect(issueText(await validatorResult(field.opts.validate, {}))).toBe('Fire permit is required.');
    expect(await validatorResult(field.opts.validate, VALID)).toBeNull();
    // Another entity's definitions do not apply.
    expect(await validatorResult(customFields({ entity: 'device' }).opts.validate, {})).toBeNull();
  });

  it('should not check an existing record whose custom fields are unchanged', async () => {
    const field = customFields({ entity: 'facility' });
    const stored = { removed_attr: 'x', floors: 3 };
    unpublish = publishCustomFields('facility', { definitions: DEFINITIONS, stored });
    // The database skips the check when custom_fields did not change; so does the form.
    expect(await validatorResult(field.opts.validate, { floors: 3, removed_attr: 'x' })).toBeNull();
    expect(issueText(await validatorResult(field.opts.validate, { ...stored, floors: 4 }))).toMatch(
      /removed_attr/,
    );
  });

  it('should forget the definitions when its input goes away', async () => {
    const field = customFields({ entity: 'facility' });
    publishCustomFields('facility', { definitions: DEFINITIONS })();
    expect(await validatorResult(field.opts.validate, {})).toBeNull();
  });
});
