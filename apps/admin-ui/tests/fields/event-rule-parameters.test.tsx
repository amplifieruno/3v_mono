// @vitest-environment jsdom
import type { ScalarDisplayProps, ScalarInputProps } from '@burojs/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { checkEventRuleParameters } from '../../src/fields/event-rule-parameters';
import { EventRuleParametersDisplay } from '../../src/fields/event-rule-parameters-display';
import {
  describeParameters,
  dwellMinutes,
  dwellSecondsOf,
  toggleKind,
  validateParameters,
} from '../../src/fields/event-rule-parameters-format';
import { EventRuleParametersInput } from '../../src/fields/event-rule-parameters-input';
import type { EventRuleParametersMeta } from '../../src/fields/event-rule-parameters-meta';
import { fakeAdminAuth, installDomShims } from '../support/console-dom';

/**
 * An event rule version's parameters by its rule type (`itap.event-rule-parameters`): the keys the
 * evaluators read (`dwell_seconds` for unusual dwell, `watch_list_kinds` for watch lists), the
 * database's CHECK on the kinds, and the editor and display chosen by the record's `rule_type`.
 */

const ORG = '11111111-1111-4111-8111-111111111111';

function renderInput(value: unknown, ruleType: string) {
  const onChange = vi.fn();
  const props = {
    meta: { typeField: 'rule_type' },
    presentation: 'default',
    accessibility: { input: 'parameters' },
    testIds: { input: 'parameters-input' },
    multiple: false,
    issues: [],
    value,
    onChange,
    record: { id: 'v1', rule_type: ruleType, parameters: value },
  } as unknown as ScalarInputProps<unknown, EventRuleParametersMeta>;
  render(
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      <EventRuleParametersInput {...props} />
    </AppRuntime>,
  );
  return onChange;
}

beforeAll(installDomShims);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('parameters by rule type', () => {
  it('should require a positive dwell time on an unusual-dwell rule only', () => {
    expect(validateParameters({ dwell_seconds: 2400 }, 'unusual_dwell')).toBeNull();
    expect(validateParameters({}, 'unusual_dwell')?.code).toBe('ruleParameters.dwellRequired');
    expect(validateParameters({ dwell_seconds: 0 }, 'unusual_dwell')?.code).toBe('ruleParameters.dwell');
    expect(validateParameters({ dwell_seconds: '40' }, 'unusual_dwell')?.code).toBe('ruleParameters.dwell');
    // Whole minutes only, as the editor's box (step 1, min 1) takes them.
    expect(validateParameters({ dwell_seconds: 90 }, 'unusual_dwell')?.code).toBe('ruleParameters.dwell');
    expect(validateParameters({ dwell_seconds: 30 }, 'unusual_dwell')?.code).toBe('ruleParameters.dwell');
    expect(validateParameters({ dwell_seconds: 60 }, 'unusual_dwell')).toBeNull();
    expect(validateParameters({}, 'loitering')).toBeNull();
    // On a form that does not carry the type, the shape alone is checked.
    expect(validateParameters({}, undefined)).toBeNull();
    expect(validateParameters([], 'watchlist')?.code).toBe('ruleParameters.notObject');
  });

  it('should accept the watch-list kinds the database accepts', () => {
    expect(validateParameters({ watch_list_kinds: ['blacklist'] }, 'watchlist')).toBeNull();
    expect(validateParameters({}, 'watchlist')).toBeNull();
    for (const kinds of [[], ['friend'], 'vip']) {
      expect(validateParameters({ watch_list_kinds: kinds }, 'watchlist')?.code).toBe('ruleParameters.watchListKinds');
    }
  });

  it('should read the rule type from the form values in the validator', () => {
    const validate = checkEventRuleParameters('rule_type') as unknown as (
      value: unknown,
      ctx: { values: Record<string, unknown> },
    ) => unknown;
    expect(validate({}, { values: { rule_type: 'unusual_dwell' } })).toMatchObject({ code: 'ruleParameters.dwellRequired' });
    expect(validate({}, { values: { rule_type: 'after_hours' } })).toBeNull();
  });

  it('should convert minutes and seconds, and drop the key for an empty box', () => {
    expect(dwellMinutes({ dwell_seconds: 2400 })).toBe('40');
    expect(dwellMinutes({})).toBe('');
    expect(dwellSecondsOf('40')).toBe(2400);
    expect(dwellSecondsOf(' ')).toBeUndefined();
  });

  it('should drop the kinds key when no kind is ticked (every kind) and keep other keys', () => {
    const one = toggleKind({ note: 1 }, 'vip', true);
    expect(one).toEqual({ note: 1, watch_list_kinds: ['vip'] });
    expect(toggleKind(one, 'blacklist', true)).toEqual({ note: 1, watch_list_kinds: ['blacklist', 'vip'] });
    expect(toggleKind(one, 'vip', false)).toEqual({ note: 1 });
  });

  it('should describe the stored parameters', () => {
    expect(describeParameters({ dwell_seconds: 5400 }, 'unusual_dwell')).toEqual([{ label: 'Dwell time', text: '1 h 30 min' }]);
    expect(describeParameters({}, 'watchlist')).toEqual([{ label: 'Watch-list kinds', text: 'Every kind' }]);
    expect(describeParameters({ watch_list_kinds: ['vip', 'watch'] }, 'watchlist')).toEqual([
      { label: 'Watch-list kinds', text: 'Watch list, VIP' },
    ]);
    expect(describeParameters({}, 'after_hours')).toEqual([]);
  });
});

describe('parameters editor', () => {
  it('should edit an unusual-dwell rule’s dwell time in minutes, keeping other keys', async () => {
    const onChange = renderInput({ dwell_seconds: 2400, note: 'x' }, 'unusual_dwell');
    const box = await screen.findByLabelText(/Dwell time/);
    expect((box as HTMLInputElement).value).toBe('40');
    fireEvent.change(box, { target: { value: '15' } });
    expect(onChange).toHaveBeenLastCalledWith({ dwell_seconds: 900, note: 'x' });
  });

  it('should tick watch-list kinds on a watch-list rule', async () => {
    const onChange = renderInput({ watch_list_kinds: ['blacklist'] }, 'watchlist');
    fireEvent.click(await screen.findByLabelText('VIP'));
    expect(onChange).toHaveBeenLastCalledWith({ watch_list_kinds: ['blacklist', 'vip'] });
  });

  it('should say where a type without parameters takes its thresholds from', async () => {
    renderInput({}, 'loitering');
    expect((await screen.findByTestId('parameters-input')).textContent).toMatch(/no parameters.*loitering threshold/);
  });

  it('should display the parameters, or the note for a type without', () => {
    const display = (value: unknown, ruleType: string) =>
      ({
        meta: { typeField: 'rule_type' },
        presentation: 'default',
        testIds: { display: 'parameters-display' },
        multiple: false,
        value,
        record: { rule_type: ruleType },
      }) as unknown as ScalarDisplayProps<unknown, EventRuleParametersMeta>;
    render(<EventRuleParametersDisplay {...display({ dwell_seconds: 2400 }, 'unusual_dwell')} />);
    expect(screen.getByTestId('parameters-display').textContent).toBe('Dwell time40 min');
    cleanup();
    render(<EventRuleParametersDisplay {...display({}, 'occupancy')} />);
    expect(screen.getByText(/capacity/)).toBeDefined();
  });
});
