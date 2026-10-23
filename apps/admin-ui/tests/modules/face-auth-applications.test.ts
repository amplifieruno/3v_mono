import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { CLIENT_APPLICATION_RESOURCE } from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { clientApplicationFields } from '../../src/modules/face-auth/application-fields';
import { FACE_AUTH_BINDING } from '../../src/modules/face-auth/application-ops';
import { LOCATION_FLOWS, THRESHOLD_CHECKS } from '../../src/modules/face-auth/application-rules';
import { bindOperationName } from '../../src/modules/face-auth/binding-ops';
import { validatorResult } from '../support/field-issues';

/**
 * Client applications without the UI: the thresholds' order (`0 ≤ min ≤ threshold ≤ max ≤ 1`)
 * is checked on the form; a sandbox application is not offered facilities or access points, and a
 * forced binding is refused with the sentence (Review Focus 5); the status flows are offered by
 * status (revoked is terminal); a revoked application is not edited or bound; refusals read as
 * sentences.
 */

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', roles: ['org_admin'] };
const APP = '99999999-9999-4999-8999-000000000001';
const SEGMENT = '99999999-9999-4999-8999-000000000002';

const application = (extra: Record<string, unknown> = {}) => ({
  id: APP,
  code: 'APP-00009',
  name: 'Kiosk',
  platform: 'kiosk',
  status: 'active',
  threshold: 0.6,
  threshold_min: 0.5,
  threshold_max: 0.9,
  liveness_required: true,
  use_work_schedules: false,
  is_sandbox: false,
  ...extra,
});

const flow = (action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource: CLIENT_APPLICATION_RESOURCE, action }, {
    user: ADMIN,
    record,
    rows: { [CLIENT_APPLICATION_RESOURCE]: [record] },
    mutations: mutations as never,
  });

beforeAll(async () => {
  await app.ready;
});

describe('thresholds', () => {
  const [atLeastMin, atMostMax, minAtMostMax] = THRESHOLD_CHECKS.map((c) => c.when as (di: { values: Record<string, unknown> }) => boolean);
  const values = (threshold_min: unknown, threshold: unknown, threshold_max: unknown) => ({ values: { threshold_min, threshold, threshold_max } });

  it('should accept min ≤ threshold ≤ max, equal values included', () => {
    for (const check of [atLeastMin, atMostMax, minAtMostMax]) {
      expect(check?.(values(0.5, 0.6, 0.9))).toBe(false);
      expect(check?.(values(0.6, 0.6, 0.6))).toBe(false);
      expect(check?.(values(0, 0, 1))).toBe(false);
    }
  });

  it('should refuse a threshold outside its minimum and maximum, and a maximum below the minimum', () => {
    expect(atLeastMin?.(values(0.7, 0.6, 0.9))).toBe(true);
    expect(atMostMax?.(values(0.5, 0.95, 0.9))).toBe(true);
    expect(minAtMostMax?.(values(0.8, 0.85, 0.7))).toBe(true);
    // An empty value is the required rule's concern, not an order.
    expect(atLeastMin?.(values(null, 0.6, 0.9))).toBe(false);
  });

  it('should check every threshold on create and edit, each within 0..1 on its own', async () => {
    expect(THRESHOLD_CHECKS.every((c) => c.on.includes('create') && c.on.includes('edit'))).toBe(true);
    for (const name of ['threshold_min', 'threshold', 'threshold_max'] as const) {
      const validate = clientApplicationFields[name].opts.validate;
      expect(await validatorResult(validate, 0.6)).toBeNull();
      expect(await validatorResult(validate, 1.2)).not.toBeNull();
      expect(await validatorResult(validate, -0.1)).not.toBeNull();
    }
  });

  it('should keep sandbox insert-only and the status out of the form', () => {
    expect(clientApplicationFields.is_sandbox.opts.write).toBe('create');
    expect(clientApplicationFields.status.opts.system).toBe(true);
  });
});

describe('sandbox applications bind no places (Review Focus 5)', () => {
  it('should not offer Add facility or Add access point on a sandbox, but offer a segment', async () => {
    expect(LOCATION_FLOWS).toEqual(['bind_facility', 'bind_access_point']);
    for (const action of LOCATION_FLOWS) {
      (await flow(action, application({ is_sandbox: true })).open()).assertUnavailable();
    }
    const run = await flow('bind_segment', application({ is_sandbox: true }), {
      'itap:bind-client-application-segment': [answer({ id: 'b1' })],
    }).open();
    run.fill({ segment_id: SEGMENT });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { applicationId: APP, value: SEGMENT } });
  });

  it('should offer every binding on a production application', async () => {
    const run = await flow('bind_facility', application(), { 'itap:bind-client-application-facility': [answer({ id: 'b2' })] }).open();
    await run.submit();
    run.assertNotSubmitted();
    run.fill({ facility_id: SEGMENT });
    await run.submit();
    run.assertOutcome('success');
    const mode = await flow('allow_mode', application(), { 'itap:bind-client-application-mode': [answer({ id: 'b3' })] }).open();
    mode.fill({ mode: 'verification' });
    await mode.submit();
    expect(mode.submitted[0]?.call).toMatchObject({ input: { applicationId: APP, value: 'verification' } });
  });
});

describe('status flows', () => {
  it('should suspend an active application and reactivate a suspended one', async () => {
    const suspend = await flow('suspend', application(), {
      'itap:set-client-application-status': [answer({ id: APP, code: 'APP-00009', status: 'suspended' })],
    }).open();
    await suspend.submit();
    await suspend.accept();
    suspend.assertOutcome('success');
    expect(suspend.submitted[0]?.call).toMatchObject({ input: { applicationId: APP, status: 'suspended' } });
    (await flow('reactivate', application()).open()).assertUnavailable();
    (await flow('suspend', application({ status: 'suspended' })).open()).assertUnavailable();
    const reactivate = await flow('reactivate', application({ status: 'suspended' }), {
      'itap:set-client-application-status': [answer({ id: APP, code: 'APP-00009', status: 'active' })],
    }).open();
    await reactivate.submit();
    await reactivate.accept();
    expect(reactivate.submitted[0]?.call).toMatchObject({ input: { status: 'active' } });
  });

  it('should revoke an active or suspended application, and offer nothing once revoked', async () => {
    for (const status of ['active', 'suspended']) {
      const run = await flow('revoke', application({ status }), {
        'itap:set-client-application-status': [answer({ id: APP, code: 'APP-00009', status: 'revoked' })],
      }).open();
      await run.submit();
      await run.accept();
      run.assertOutcome('success');
      expect(run.submitted[0]?.call).toMatchObject({ input: { status: 'revoked' } });
    }
    const revoked = application({ status: 'revoked' });
    for (const action of ['suspend', 'reactivate', 'revoke']) (await flow(action, revoked).open()).assertUnavailable();
  });

  it('should not edit or bind a revoked application, saying why', async () => {
    for (const action of ['bind_segment', 'bind_facility', 'allow_mode', 'share_attribute']) {
      (await flow(action, application({ status: 'revoked' })).open()).assertDisabled(/application is revoked/);
    }
  });
});

describe('refusals through the provider', () => {
  const providerFailing = (message: string) =>
    withActionRefusals(
      defineDataProvider({
        mutations: {
          custom: defineMutationHandler(async () =>
            Promise.reject({
              kind: 'sent',
              code: 'permission-error',
              message,
              details: [{ message, extensions: { code: 'permission-error' } }],
            } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    );
  const call = (operation: string) => ({ kind: 'custom', resource: FACE_AUTH_BINDING, operation, input: {} }) as never;
  const refused = (message: string, operation: string) => providerFailing(message).mutations?.custom?.(call(operation), {} as never);

  it('should read a sandbox location binding as the sandbox sentence', async () => {
    for (const operation of [bindOperationName('facility'), bindOperationName('access_point')]) {
      await expect(refused('Check constraint violation. sandbox_location_binding', operation)).rejects.toMatchObject({
        kind: 'validation',
        code: 'sandbox_location_binding',
        details: { issues: [{ message: { default: expect.stringMatching(/sandbox application binds no facilities or access points/) } }] },
      });
    }
  });

  it('should read a duplicate binding, a revoked status and a delete with history as sentences', async () => {
    await expect(
      refused('Uniqueness violation. duplicate key value violates unique constraint "client_application_segments_key"', 'bindSegment'),
    ).rejects.toMatchObject({ details: { issues: [{ message: { default: expect.stringMatching(/already bound/) } }] } });
    await expect(refused('Check constraint violation. client_application_revoked', 'setClientApplicationStatus')).rejects.toMatchObject({
      code: 'client_application_revoked',
    });
    await expect(
      refused(
        'Foreign key violation. update or delete on table "client_applications" violates foreign key constraint "authentication_attempts_application_fkey" on table "authentication_attempts"',
        'deleteClientApplication',
      ),
    ).rejects.toMatchObject({ details: { issues: [{ message: { default: expect.stringMatching(/Revoke the application instead/) } }] } });
  });

  it('should name every face-auth operation in the refusal registry', () => {
    const names = Object.keys(ACTION_REFUSALS).filter((key) => key.startsWith(`${FACE_AUTH_BINDING}.`));
    expect(names.sort()).toEqual(
      [
        'authenticateFace',
        'bindAccessPoint',
        'bindAttribute',
        'bindFacility',
        'bindMode',
        'bindSegment',
        'deleteClientApplication',
        'reviewAuthenticationAttempt',
        'revokeClientKey',
        'rotateClientKey',
        'setClientApplicationStatus',
      ].map(
        (name) => `${FACE_AUTH_BINDING}.${name}`,
      ),
    );
  });
});
