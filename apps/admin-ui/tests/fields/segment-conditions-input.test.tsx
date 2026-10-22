// @vitest-environment jsdom
import type { ScalarDisplayProps, ScalarInputProps } from '@burojs/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { SegmentConditionsDisplay } from '../../src/fields/segment-conditions-display';
import { SegmentConditionsInput } from '../../src/fields/segment-conditions-input';
import type { SegmentConditionsMeta } from '../../src/fields/segment-conditions-meta';
import { conditionsSnapshot } from '../../src/fields/segment-conditions-registry';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';
import { ACME, VIPS, catalogAnswer } from '../support/segment-conditions-fixture';

/**
 * The conditions editor on screen: the tree over the catalog of the form's target, adding and
 * removing nodes, a field the catalog no longer offers kept and flagged (Review Focus 1), a form
 * issue with a condition path landing on its node (Review Focus 2), and the sentence display.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const leaf = (field: string, operator: string, value: unknown) => ({ field, operator, value });

function Wrapper({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  return (
    <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
      {children}
    </AppRuntime>
  );
}

const props = (value: unknown, extra: Record<string, unknown> = {}) =>
  ({
    meta: { targetField: 'target' },
    presentation: 'default',
    accessibility: { input: 'conditions' },
    testIds: { input: 'conditions-input', display: 'conditions-display' },
    multiple: false,
    issues: [],
    value,
    path: ['conditions'],
    form: { target: 'profiles' },
    ...extra,
  }) as unknown as ScalarInputProps<unknown, SegmentConditionsMeta>;

/** The input with its value held, as a form holds it; `changes` records every write. */
function Harness({ initial, changes, issues = [] }: { readonly initial: unknown; readonly changes: unknown[]; readonly issues?: readonly unknown[] }) {
  const [value, setValue] = React.useState<unknown>(initial);
  return (
    <SegmentConditionsInput
      {...props(value, {
        issues,
        onChange: (next: unknown) => {
          changes.push(next);
          setValue(next);
        },
      })}
    />
  );
}

beforeAll(() => {
  installDomShims();
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => hasuraResponse(catalogAnswer())));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the conditions editor', () => {
  it('should start empty and add a first condition from the catalog', async () => {
    const changes: unknown[] = [];
    render(<Harness initial={{}} changes={changes} />, { wrapper: Wrapper });
    expect(await screen.findByText('No conditions yet.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /^Add condition/ }));
    expect(changes.at(-1)).toEqual(leaf('first_name', 'eq', ''));
    // A root condition grows into an "all of" group when another one is added.
    fireEvent.click(screen.getByRole('button', { name: /^Add condition/ }));
    expect(changes.at(-1)).toEqual({ op: 'and', children: [leaf('first_name', 'eq', ''), leaf('first_name', 'eq', '')] });
    // Both new conditions lack a value: each says so on its own node.
    const second = await screen.findByTestId('segment-node-$.children[1]');
    expect(within(second).getByText('Enter some text.').id).toMatch(/-1-problem$/);
    expect(within(second).queryByRole('alert')).toBeNull();
  });

  it('should ask for the target before offering fields', async () => {
    render(<SegmentConditionsInput {...props({}, { form: {} })} />, { wrapper: Wrapper });
    expect(await screen.findByText(/Choose who the members are first/)).toBeDefined();
  });

  it('should read the tree, publish the catalog for the validator and remove and move nodes', async () => {
    const changes: unknown[] = [];
    const initial = { op: 'and', children: [leaf('status', 'eq', 'active'), leaf('company_id', 'in', [ACME])] };
    render(<Harness initial={initial} changes={changes} />, { wrapper: Wrapper });
    const sentence = await screen.findByTestId('conditions-sentence');
    expect(sentence.textContent).toBe('Reads: Status is active and Company is one of Acme');
    await waitFor(() => expect(conditionsSnapshot('profiles')?.catalog?.has('status')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Move Condition 2 up' }));
    expect(changes.at(-1)).toEqual({ op: 'and', children: [leaf('company_id', 'in', [ACME]), leaf('status', 'eq', 'active')] });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Condition 1' }));
    expect(changes.at(-1)).toEqual({ op: 'and', children: [leaf('status', 'eq', 'active')] });
    cleanup();
    expect(conditionsSnapshot('profiles')).toBeUndefined();
  });

  it('should keep a field the catalog no longer offers, flagged on its node (Review Focus 1)', async () => {
    const initial = { op: 'and', children: [leaf('status', 'eq', 'active'), leaf('custom_fields.badge_number', 'eq', 'B-1')] };
    render(<Harness initial={initial} changes={[]} />, { wrapper: Wrapper });
    const node = await screen.findByTestId('segment-node-$.children[1]');
    expect(node.getAttribute('data-invalid')).toBe('true');
    expect(node.textContent).toContain('“custom_fields.badge_number” (no longer offered)');
    expect(within(node).getByText(/^The field “custom_fields.badge_number” is not offered/)).toBeDefined();
    expect(screen.getByTestId('segment-node-$.children[0]').getAttribute('data-invalid')).toBeNull();
  });

  it('should put a form issue with a condition path on that node (Review Focus 2)', async () => {
    const issue = {
      code: 'segment_condition_invalid',
      message: { key: 'x.server', default: 'The server refused this value.' },
      path: ['conditions', '$.children[1].value'],
      source: 'server',
      severity: 'error',
    };
    const initial = { op: 'and', children: [leaf('status', 'eq', 'active'), leaf('member_of_segment', 'eq', VIPS)] };
    render(<Harness initial={initial} changes={[]} issues={[issue]} />, { wrapper: Wrapper });
    const node = await screen.findByTestId('segment-node-$.children[1]');
    expect(node.getAttribute('data-invalid')).toBe('true');
    const problem = within(node).getByText('The server refused this value.');
    // Only the value control is flagged and points at the text.
    const flagged = node.querySelectorAll('[aria-invalid="true"]');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.getAttribute('aria-describedby')).toBe(problem.id);
    expect(screen.getByTestId('segment-node-$.children[0]').getAttribute('data-invalid')).toBeNull();
  });

  it('should show a failed catalog read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => hasuraResponse({ errors: [{ message: 'boom', extensions: { code: 'unexpected' } }] })));
    render(<SegmentConditionsInput {...props({})} />, { wrapper: Wrapper });
    expect(await screen.findByText('The fields and records conditions can name could not be read.')).toBeDefined();
  });
});

describe('the conditions display', () => {
  it('should read the conditions as a sentence with the catalog’s labels', async () => {
    const value = { op: 'not', children: [leaf('member_of_segment', 'eq', VIPS)] };
    const display = { ...props(value), record: { target: 'profiles' } } as unknown as ScalarDisplayProps<unknown, SegmentConditionsMeta>;
    render(<SegmentConditionsDisplay {...display} />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('conditions-display').textContent).toBe('not (Member of segment is VIP guests)'));
  });

  it('should read no conditions as such without asking for the catalog', async () => {
    const display = { ...props({}), record: { target: 'profiles' } } as unknown as ScalarDisplayProps<unknown, SegmentConditionsMeta>;
    render(<SegmentConditionsDisplay {...display} />, { wrapper: Wrapper });
    expect((await screen.findByTestId('conditions-display')).textContent).toBe('No conditions.');
    const asked = vi.mocked(fetch).mock.calls.map(([, init]) => String(init?.body));
    expect(asked.some((body) => body.includes('segment_fields'))).toBe(false);
  });
});
