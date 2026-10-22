import { type AppContext, type ReadDataAccess, evaluateChecks } from '@burojs/core';
import { describeScreen } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { ITAP_TABLES } from '../../src/modules';
import {
  SETTINGS_RANGES,
  SETTINGS_RESOURCE,
  organizationSettings,
  settingsFields,
} from '../../src/modules/organization/settings';
import { issueText } from '../support/field-issues';

/**
 * The organization settings record: four panels, the org_admin update columns
 * editable and the policy counters read-only, every range refused with the
 * range in the message, and the recognition-threshold warnings.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';

const ROW = {
  organization_id: NOVA,
  recognition_threshold: 0.4,
  enrollment_duplicate_threshold: 0.5,
  detection_counter_throttle_seconds: 10,
  tracking_timeout_seconds: 300,
  tailgating_window_seconds: 5,
  abnormal_movement_max_count: 1,
  abnormal_movement_min_total: 20,
  archive_unknown_after_days: 90,
  default_retention_days: 90,
  consent_embedding_retention_days: 30,
  policy_revocation_bound_seconds: 60,
  face_credential_cooldown_seconds: 10,
  policy_epoch: 46,
  policy_epoch_at: '2026-10-20T20:39:17Z',
  policy_urgent_epoch: 46,
  policy_urgent_at: '2026-10-20T20:39:17Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
};

/** The `org_admin` update columns of `itap.organization_settings` (Hasura metadata). */
const WRITABLE = [
  'recognition_threshold',
  'enrollment_duplicate_threshold',
  'tracking_timeout_seconds',
  'archive_unknown_after_days',
  'tailgating_window_seconds',
  'default_retention_days',
  'detection_counter_throttle_seconds',
  'abnormal_movement_max_count',
  'abnormal_movement_min_total',
  'policy_revocation_bound_seconds',
  'face_credential_cooldown_seconds',
  'consent_embedding_retention_days',
].sort();

const COUNTERS = ['policy_epoch', 'policy_epoch_at', 'policy_urgent_epoch', 'policy_urgent_at'];

type Validator = (
  value: unknown,
  ctx: { values: Record<string, unknown>; resource: string; field: string },
) => unknown;

function validatorOf(name: keyof typeof SETTINGS_RANGES): Validator {
  const validate = (settingsFields[name].opts as { validate?: unknown }).validate;
  if (typeof validate !== 'function') throw new Error(`${name} has no validate function`);
  return validate as Validator;
}

async function validate(name: keyof typeof SETTINGS_RANGES, value: unknown): Promise<unknown> {
  return issueText(
    await validatorOf(name)(value, {
      values: { [name]: value },
      resource: SETTINGS_RESOURCE,
      field: name,
    }),
  );
}

async function firedChecks(values: Record<string, unknown>): Promise<string[]> {
  const outcome = await evaluateChecks({
    // The checks the forms resolve: the resource's, through the app's check source.
    checks: app.checkSource.checks(SETTINGS_RESOURCE),
    surface: 'edit',
    resource: SETTINGS_RESOURCE,
    values,
    saved: ROW,
    ctx: {} as AppContext,
    t: (key) => key,
    data: {} as ReadDataAccess,
    signal: new AbortController().signal,
    scope: { status: 'ready', value: null, refreshing: false },
  });
  return outcome.confirmable.map((issue) => issue.code);
}

beforeAll(async () => {
  await app.ready;
});

describe('organization settings', () => {
  it('should map the table by organization_id and select every declared column', () => {
    expect(ITAP_TABLES[SETTINGS_RESOURCE]).toMatchObject({
      table: 'organization_settings',
      pkField: 'organization_id',
      selectFields: Object.keys(settingsFields),
    });
    expect(app.registry.customPages.list().map((page) => page.name)).toContain(
      'organization-settings',
    );
  });

  it('should show the four panels on the edit screen with exactly the writable fields active', () => {
    const screen = describeScreen(organizationSettings, 'edit', { sources: { record: ROW } });
    expect(screen.issues).toEqual([]);
    expect(screen.visibleKeys()).toEqual(
      expect.arrayContaining(['recognition', 'tracking', 'retention', 'access']),
    );
    const active = Object.entries(screen.fields)
      .filter(([, status]) => status === 'active')
      .map(([name]) => name)
      .sort();
    expect(active).toEqual(WRITABLE);
    for (const name of COUNTERS) expect(screen.fields[name], name).toBe('readonly');
  });

  it('should show the same panels and the policy counters on the show screen', () => {
    const screen = describeScreen(organizationSettings, 'show', { sources: { record: ROW } });
    expect(screen.visibleKeys()).toEqual(
      expect.arrayContaining(['recognition', 'tracking', 'retention', 'access', 'record']),
    );
    for (const name of [...WRITABLE, ...COUNTERS])
      expect(screen.fields[name], name).not.toBe('inactive');
  });

  it('should refuse a value outside each range with the range in the message', async () => {
    for (const [name, range] of Object.entries(SETTINGS_RANGES) as [
      keyof typeof SETTINGS_RANGES,
      (typeof SETTINGS_RANGES)[keyof typeof SETTINGS_RANGES],
    ][]) {
      const step = 'integer' in range ? 1 : 0.01;
      expect(await validate(name, range.min), `${name} min`).toBeNull();
      expect(await validate(name, range.max), `${name} max`).toBeNull();
      for (const outside of [range.min - step, range.max + step]) {
        const message = await validate(name, outside);
        expect(message, `${name} ${outside}`).toEqual(
          expect.stringContaining(`from ${range.min} to ${range.max}`),
        );
      }
    }
  });

  it('should mirror the database CHECK ranges', () => {
    expect(SETTINGS_RANGES.policy_revocation_bound_seconds).toMatchObject({ min: 10, max: 3600 });
    expect(SETTINGS_RANGES.face_credential_cooldown_seconds).toMatchObject({ min: 1, max: 3600 });
    expect(SETTINGS_RANGES.consent_embedding_retention_days).toMatchObject({ min: 1, max: 3650 });
    expect(SETTINGS_RANGES.abnormal_movement_max_count.min).toBe(0);
    expect(SETTINGS_RANGES.abnormal_movement_min_total.min).toBe(1);
  });

  it('should refuse a fraction in a whole-number field and leave an empty value to required', async () => {
    expect(await validate('tracking_timeout_seconds', 300.5)).toBe(
      'Enter a whole number from 30 to 86400.',
    );
    expect(await validate('recognition_threshold', 0.45)).toBeNull();
    expect(await validate('tracking_timeout_seconds', null)).toBeNull();
    expect(settingsFields.tracking_timeout_seconds.opts.required).toBe(true);
  });

  it('should warn before saving a recognition threshold below 0.35 or above 0.65', async () => {
    expect(await firedChecks({ ...ROW, recognition_threshold: 0.3 })).toEqual([
      'check.lowRecognitionThreshold',
    ]);
    expect(await firedChecks({ ...ROW, recognition_threshold: 0.7 })).toEqual([
      'check.highRecognitionThreshold',
    ]);
    expect(await firedChecks({ ...ROW, recognition_threshold: 0.35 })).toEqual([]);
    expect(await firedChecks({ ...ROW, recognition_threshold: 0.5 })).toEqual([]);
  });
});
