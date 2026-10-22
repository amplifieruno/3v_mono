// @vitest-environment jsdom
import type { ScalarDisplayProps, ScalarInputProps } from '@burojs/react';
import { cleanup, render, screen, within } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { checkNotificationConditions, conditionIssue } from '../../src/fields/notification-conditions';
import { NotificationConditionsDisplay } from '../../src/fields/notification-conditions-display';
import {
  type ConditionReferences,
  areaChoices,
  validateConditions,
  withCondition,
  withFacility,
} from '../../src/fields/notification-conditions-format';
import { NotificationConditionsInput } from '../../src/fields/notification-conditions-input';
import { expectTranslated, validatorResult } from '../support/field-issues';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * A notification rule's conditions (`itap.notification-conditions`): the rule language of the
 * database trigger `validate_notification_rule_conditions` (keys, uuids, severities, ids of the
 * organization, the area in the facility), the editor that offers only valid combinations and
 * puts a problem on its condition's row, and the readable display.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const id = (n: number): string => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const [TOWER, ANNEX, LOBBY, DOCK, VIPS] = [id(1), id(2), id(3), id(4), id(5)] as const;

const REFS: ConditionReferences = {
  facilities: [
    { id: TOWER, name: 'Nova Tower' },
    { id: ANNEX, name: 'Annex' },
  ],
  areas: [
    { id: LOBBY, name: 'Lobby', facility_id: TOWER },
    { id: DOCK, name: 'Loading dock', facility_id: ANNEX },
  ],
  segments: [{ id: VIPS, name: 'VIP guests' }],
};

function Wrapper({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      {children}
    </AppRuntime>
  );
}

const baseProps = (value: unknown, issues: readonly unknown[] = []) =>
  ({
    meta: {},
    presentation: 'default',
    accessibility: { input: 'conditions' },
    testIds: { input: 'conditions-input', display: 'conditions-display' },
    multiple: false,
    issues,
    value,
    path: ['conditions'],
  }) as unknown as ScalarInputProps<unknown>;

beforeAll(installDomShims);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => hasuraResponse({ data: REFS })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the condition language', () => {
  it('should accept what the database accepts', () => {
    for (const ok of [
      {},
      { facility_id: TOWER },
      { area_id: LOBBY },
      { facility_id: TOWER, area_id: LOBBY },
      { segment_id: VIPS, min_severity: 'high' },
      { min_severity: 'info' },
    ]) {
      expect(validateConditions(ok, REFS), JSON.stringify(ok)).toBeNull();
    }
  });

  it('should refuse the shapes the trigger refuses, on their condition', () => {
    const refused: readonly [unknown, string, string | undefined][] = [
      [[], 'notificationConditions.notObject', undefined],
      ['{}', 'notificationConditions.notObject', undefined],
      [{ building: TOWER }, 'notificationConditions.unknownKey', 'building'],
      [{ facility_id: 'tower' }, 'notificationConditions.badId', 'facility_id'],
      [{ area_id: 7 }, 'notificationConditions.badId', 'area_id'],
      [{ segment_id: null }, 'notificationConditions.badId', 'segment_id'],
      [{ min_severity: 'urgent' }, 'notificationConditions.badSeverity', 'min_severity'],
      [{ min_severity: 3 }, 'notificationConditions.badSeverity', 'min_severity'],
    ];
    for (const [value, code, node] of refused) {
      const problem = validateConditions(value);
      expect(problem?.code, JSON.stringify(value)).toBe(code);
      expect(problem?.node, JSON.stringify(value)).toBe(node);
    }
  });

  it('should check the ids against the organization and the area against the facility', () => {
    expect(validateConditions({ facility_id: id(99) }, REFS)).toMatchObject({ code: 'notificationConditions.gone', node: 'facility_id' });
    expect(validateConditions({ area_id: id(99) }, REFS)).toMatchObject({ code: 'notificationConditions.gone', node: 'area_id' });
    expect(validateConditions({ segment_id: id(99) }, REFS)).toMatchObject({ code: 'notificationConditions.gone', node: 'segment_id' });
    expect(validateConditions({ facility_id: TOWER, area_id: DOCK }, REFS)).toMatchObject({
      code: 'notificationConditions.areaOutsideFacility',
      node: 'area_id',
    });
    // Without the organization's records only the shape is checked.
    expect(validateConditions({ facility_id: id(99) })).toBeNull();
  });

  it('should offer only the chosen facility’s areas and drop an area outside a new facility', () => {
    expect(areaChoices({}, REFS).map((area) => area.name)).toEqual(['Lobby', 'Loading dock']);
    expect(areaChoices({ facility_id: ANNEX }, REFS).map((area) => area.name)).toEqual(['Loading dock']);
    expect(withFacility({ facility_id: TOWER, area_id: LOBBY, min_severity: 'high' }, ANNEX, REFS)).toEqual({
      facility_id: ANNEX,
      min_severity: 'high',
    });
    expect(withFacility({ area_id: LOBBY }, TOWER, REFS)).toEqual({ area_id: LOBBY, facility_id: TOWER });
    expect(withFacility({ facility_id: TOWER, area_id: LOBBY }, undefined, REFS)).toEqual({ area_id: LOBBY });
    expect(withCondition({ min_severity: 'high' }, 'min_severity', undefined)).toEqual({});
  });

  it('should compare ids whatever their spelling, as the database compares uuids', () => {
    expect(areaChoices({ facility_id: ANNEX.toUpperCase() }, REFS).map((area) => area.name)).toEqual(['Loading dock']);
    expect(withFacility({ area_id: DOCK.toUpperCase() }, ANNEX, REFS)).toEqual({ area_id: DOCK.toUpperCase(), facility_id: ANNEX });
    expect(withFacility({ area_id: DOCK }, ANNEX.toUpperCase(), REFS)).toEqual({ area_id: DOCK, facility_id: ANNEX.toUpperCase() });
  });

  it('should answer the validator with a translatable issue on the condition’s path', async () => {
    const validate = checkNotificationConditions();
    expect(await validatorResult(validate, { facility_id: TOWER })).toBeNull();
    // The column is NOT NULL: nothing stored is refused, "every event" is `{}`.
    expect(await validatorResult(validate, {})).toBeNull();
    expect(await validatorResult(validate, null)).toMatchObject({ path: [] });
    expect(validateConditions(null)?.code).toBe('notificationConditions.notObject');
    const problem = validateConditions({ min_severity: 'urgent' });
    if (problem === null) throw new Error('expected a problem');
    expect(await validatorResult(validate, { min_severity: 'urgent' })).toEqual(conditionIssue(problem));
    expect(conditionIssue(problem).path).toEqual(['min_severity']);
    for (const value of [[], { building: 1 }, { facility_id: 'x' }, { min_severity: 'urgent' }]) {
      const each = validateConditions(value);
      if (each !== null) await expectTranslated(each);
    }
    for (const value of [{ facility_id: id(99) }, { facility_id: TOWER, area_id: DOCK }]) {
      const each = validateConditions(value, REFS);
      if (each !== null) await expectTranslated(each);
    }
  });
});

describe('the conditions editor', () => {
  it('should show one row per condition with the stored choices', async () => {
    render(<NotificationConditionsInput {...baseProps({ facility_id: TOWER, min_severity: 'high' })} />, { wrapper: Wrapper });
    const facility = await screen.findByTestId('condition-conditions-facility_id');
    expect(facility.textContent).toContain('Nova Tower');
    expect(screen.getByTestId('condition-conditions-area_id').textContent).toContain('Any area');
    expect(screen.getByTestId('condition-conditions-segment_id').textContent).toContain('Anyone');
    expect(screen.getByTestId('condition-conditions-min_severity').textContent).toContain('High');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('should flag a deleted record and an area outside the facility on their row', async () => {
    render(<NotificationConditionsInput {...baseProps({ facility_id: TOWER, area_id: DOCK, segment_id: VIPS })} />, {
      wrapper: Wrapper,
    });
    const area = await screen.findByTestId('condition-conditions-area_id');
    expect(within(area).getByRole('alert').textContent).toBe(
      'The area is not in the chosen facility: choose one of its areas or clear the area.',
    );
    expect(area.getAttribute('data-invalid')).toBe('true');
    // The row names the stored area the way its problem reads, not as unknown.
    expect(area.textContent).toContain('Loading dock (not in the chosen facility)');
    expect(area.textContent).not.toContain('Unknown');
    expect(screen.getByTestId('condition-conditions-facility_id').getAttribute('data-invalid')).toBeNull();
    cleanup();

    render(<NotificationConditionsInput {...baseProps({ segment_id: id(99) })} />, { wrapper: Wrapper });
    const segment = await screen.findByTestId('condition-conditions-segment_id');
    expect(segment.textContent).toContain(`Unknown: ${id(99)}`);
    expect(within(segment).getByRole('alert').textContent).toContain('no longer exists');
  });

  it('should mark the row a validation issue names', async () => {
    const issue = { ...conditionIssue({ code: 'notificationConditions.badSeverity', text: 'x', node: 'min_severity' }), path: ['conditions', 'min_severity'] };
    render(<NotificationConditionsInput {...baseProps({ min_severity: 'urgent' }, [issue])} />, { wrapper: Wrapper });
    const severity = await screen.findByTestId('condition-conditions-min_severity');
    expect(severity.getAttribute('data-invalid')).toBe('true');
    expect(screen.getByTestId('condition-conditions-facility_id').getAttribute('data-invalid')).toBeNull();
  });
});

describe('the conditions display', () => {
  const show = (value: unknown, presentation = 'default') =>
    render(<NotificationConditionsDisplay {...({ ...baseProps(value), presentation } as unknown as ScalarDisplayProps<unknown>)} />, {
      wrapper: Wrapper,
    });

  it('should read an empty object as every event of the rule’s types', async () => {
    show({});
    expect(await screen.findByText('Every event of the rule’s event types.')).toBeDefined();
  });

  it('should name the records and say what each condition means', async () => {
    show({ facility_id: TOWER, area_id: LOBBY, segment_id: VIPS, min_severity: 'high' });
    expect(await screen.findByText('Nova Tower')).toBeDefined();
    const text = screen.getByTestId('conditions-display').textContent ?? '';
    expect(text).toContain('Lobby, and the areas inside it');
    expect(text).toContain('VIP guests (members when the event happens)');
    expect(text).toContain('High');
    expect(text).toContain('and above');
  });

  it('should show a key the language does not know as stored', async () => {
    show({ building: 'B' }, 'plain');
    expect((await screen.findByTestId('conditions-display')).textContent).toContain('building: "B"');
  });
});

