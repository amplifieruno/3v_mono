// @vitest-environment jsdom
import type { ScalarInputProps } from '@burojs/react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../../src/app/runtime';
import { CustomFieldsInput } from '../../src/fields/custom-fields-input';
import type { CustomFieldsMeta } from '../../src/fields/custom-fields-meta';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

const published = vi.hoisted(() => ({ count: 0 }));

vi.mock('../../src/fields/custom-fields-registry', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/fields/custom-fields-registry')>();
  return {
    ...original,
    publishCustomFields: (...args: Parameters<typeof original.publishCustomFields>) => {
      published.count += 1;
      return original.publishCustomFields(...args);
    },
  };
});

/**
 * The `customFields` input publishes what its validator reads (the definitions and the stored
 * value, G17) once per change of those, not on every render.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
/** The record being edited: the same object across renders, as the form holds it. */
const RECORD = { custom_fields: { cost_code: 'A1' } };

async function serve(): Promise<Response> {
  return hasuraResponse({
    data: {
      items: [
        {
          id: 'd1',
          entity: 'facility',
          key: 'cost_code',
          label: 'Cost code',
          data_type: 'string',
          options: null,
          required: false,
          is_active: true,
          sort_order: 1,
        },
      ],
    },
  });
}

function input(value: unknown) {
  const props = {
    meta: { entity: 'facility' },
    value,
    onChange: () => undefined,
    record: RECORD,
    path: ['custom_fields'],
    presentation: 'default',
    accessibility: { input: 'custom-fields' },
    testIds: { input: 'custom-fields-input' },
    issues: [],
    multiple: false,
  } as unknown as ScalarInputProps<unknown, CustomFieldsMeta>;
  return <CustomFieldsInput {...props} />;
}

beforeAll(installDomShims);

beforeEach(() => {
  published.count = 0;
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('custom fields input', () => {
  it('should publish its snapshot once, not on every render', async () => {
    const wrap = (value: unknown) => (
      <AppRuntime auth={fakeAdminAuth(ORG, 'Nova')} initialOrganizationId={ORG}>
        {input(value)}
      </AppRuntime>
    );
    const view = render(wrap({ cost_code: 'A1' }));
    expect(await screen.findByLabelText('Cost code')).toBeDefined();
    const afterLoad = published.count;
    expect(afterLoad).toBe(1);
    view.rerender(wrap({ cost_code: 'A2' }));
    view.rerender(wrap({ cost_code: 'A3' }));
    expect(published.count).toBe(afterLoad);
  });
});
