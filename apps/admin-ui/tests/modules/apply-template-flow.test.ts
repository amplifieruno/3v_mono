import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { templateNodesOf } from '../../src/fields/template-structure-format';
import { HASURA_OPERATIONS } from '../../src/modules';
import { summarizeApplied } from '../../src/modules/places/apply-template';
import { FACILITY_RESOURCE } from '../../src/modules/places/facility';
import { overlappingNames } from '../../src/modules/places/template-overlap';

/**
 * The facility's "Apply template" flow without the UI: it sends `apply_facility_template` with
 * the chosen template, the facility and the optional parent area, and tells what the server
 * created. The function never skips an existing name, so the form's overlap check (pure here)
 * is what warns before a template is applied twice.
 */

const ADMIN = { id: 'u1', roles: ['org_admin'] };
const FACILITY = '55555555-5555-4555-8555-555555555555';
const TEMPLATE = '77777777-7777-4777-8777-777777777777';
const FLOOR = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002';
const NOVA = { id: FACILITY, name: 'Nova Tower', status: 'active', timezone: 'UTC' };
const APPLIED = { created: 5, top_level: 4, names: 'Elevator Lobby, Open Office, Meeting Room, Kitchen' };

const target = { resource: FACILITY_RESOURCE, action: 'apply_template' } as const;

beforeAll(async () => {
  await app.ready;
});

describe('apply template flow', () => {
  it('should apply the template inside the chosen area and report the created areas', async () => {
    const flow = runFlow(app, target, {
      user: ADMIN,
      record: NOVA,
      rows: { [FACILITY_RESOURCE]: [NOVA] },
      mutations: { 'itap:apply-facility-template': [answer(APPLIED)] },
    });
    await flow.fill({ template_id: TEMPLATE, parent_area_id: FLOOR }).submit();
    flow.assertOutcome('success');
    expect(flow.submitted).toHaveLength(1);
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { templateId: TEMPLATE, facilityId: FACILITY, parentAreaId: FLOOR },
    });
    expect(flow.state.effects?.notify).toBe(
      'Template applied: 5 areas created (4 at the top: Elevator Lobby, Open Office, Meeting Room, Kitchen).',
    );
  });

  it('should apply at the top level when no area is chosen', async () => {
    const flow = runFlow(app, target, {
      user: ADMIN,
      record: NOVA,
      rows: { [FACILITY_RESOURCE]: [NOVA] },
      mutations: { 'itap:apply-facility-template': [answer(APPLIED)] },
    });
    await flow.fill({ template_id: TEMPLATE }).submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({
      input: { templateId: TEMPLATE, facilityId: FACILITY },
    });
    const input = (flow.submitted[0]?.call as { input?: Record<string, unknown> }).input;
    expect(input?.parentAreaId ?? null).toBeNull();
  });

  it('should not submit without a template', async () => {
    const flow = runFlow(app, target, {
      user: ADMIN,
      record: NOVA,
      rows: { [FACILITY_RESOURCE]: [NOVA] },
      mutations: { 'itap:apply-facility-template': [answer(APPLIED)] },
    });
    await flow.fill({ parent_area_id: FLOOR }).submit();
    flow.assertNotSubmitted();
  });

  it('should map the function variables and count the created areas', () => {
    const entry = HASURA_OPERATIONS.places?.applyFacilityTemplate;
    expect(entry?.kind).toBe('mutation');
    expect(
      entry?.variables?.({ templateId: TEMPLATE, facilityId: FACILITY, parentAreaId: null }),
    ).toEqual({ template: TEMPLATE, facility: FACILITY, parent: null });
    const rows = [
      { id: 'a', name: 'Lobby', parent_id: FLOOR },
      { id: 'b', name: 'Office', parent_id: FLOOR },
      { id: 'c', name: 'Booths', parent_id: 'b' },
    ];
    expect(entry?.mapResult?.({ apply_facility_template: rows })).toEqual({
      created: 3,
      top_level: 2,
      names: 'Lobby, Office',
    });
    expect(summarizeApplied([])).toEqual({ created: 0, top_level: 0, names: '' });
  });
});

describe('template overlap', () => {
  const roots = templateNodesOf([
    { name: 'Lobby', area_type: 'zone', children: [{ name: 'Desk', area_type: 'room' }] },
    { name: 'Kitchen', area_type: 'room' },
  ]);

  it('should name the top-level areas that already exist under the same parent', () => {
    const areas = [
      { name: 'lobby ', parent_id: FLOOR },
      { name: 'Kitchen', parent_id: null },
      // A sub-area name of the template is not compared: only the top level lands beside these.
      { name: 'Desk', parent_id: FLOOR },
    ];
    expect(overlappingNames(roots, areas, FLOOR)).toEqual(['Lobby']);
    expect(overlappingNames(roots, areas, null)).toEqual(['Kitchen']);
    expect(overlappingNames(roots, [], null)).toEqual([]);
  });
});
