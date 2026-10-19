import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { createRuleWithDraft, deleteByPk, insertOne, updateByPk } from './support/operations.js';
import {
  createSegment,
  dynamicSegment,
  manualSegment,
  SEGMENT_FIELDS,
  segmentWorld,
  type Segment,
} from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

const FREQUENT = { field: 'visits_last_30d', operator: 'gte', value: 5 };

describe('segments', () => {
  it('should number segments and enforce kind, conditions, color and window rules', async () => {
    const w = await segmentWorld();
    const manual = await manualSegment(w.a, 'profiles', { color: '#1A2b3C', icon: 'star' });
    expect(manual).toMatchObject({ code: 'SEGMENT-00001', kind: 'manual', status: 'active', member_count: 0, conditions: {} });
    const dynamic = await dynamicSegment(w.a, 'identities', FREQUENT, {
      active_from: '2026-01-01T00:00:00Z',
      active_until: '2026-02-01T00:00:00Z',
      schedule: [{ days: [1, 2, 3, 4, 5], from: '22:00', to: '06:00' }],
    });
    expect(dynamic.code).toBe('SEGMENT-00002');
    // Dynamic needs conditions; manual has none.
    expect((await expectError(dynamicSegment(w.a, 'profiles', {}))).message).toMatch(/segments_conditions_match_kind/);
    expect((await expectError(manualSegment(w.a, 'profiles', { conditions: FREQUENT }))).message).toMatch(
      /segments_conditions_match_kind/,
    );
    expect((await expectError(manualSegment(w.a, 'profiles', { color: 'red' }))).message).toMatch(/segments_color_hex/);
    expect(
      (await expectError(manualSegment(w.a, 'profiles', { active_from: '2026-02-01T00:00:00Z', active_until: '2026-01-01T00:00:00Z' })))
        .message,
    ).toMatch(/segments_active_window_ordered/);
    expect((await expectError(manualSegment(w.a, 'profiles', { schedule: [{ days: [9], from: '1', to: '2' }] }))).message).toMatch(
      /segments_schedule_valid/,
    );
    // System columns and kind/target are not writable by org_admin.
    await expectDenied(createSegment(w.a, { kind: 'manual', target: 'profiles', member_count: 3 }), 'member_count');
    await expectDenied(updateByPk(w.a, 'segments', manual.id, { last_evaluated_at: 'now()' }), 'last_evaluated_at');
    await expectDenied(updateByPk(w.a, 'segments', manual.id, { kind: 'dynamic' }), 'kind');
    await expectDenied(updateByPk(w.a, 'segments', manual.id, { target: 'identities' }), 'target');
    // ... and not at the database level either (cycles stay impossible: a referenced manual segment stays manual).
    await expect(runSql(`UPDATE itap.segments SET kind = 'dynamic', conditions = '${JSON.stringify(FREQUENT)}' WHERE id = '${manual.id}'`))
      .rejects.toThrow(/segment_kind_immutable/);
    // Another organization sees nothing.
    expect((await w.b.request<{ segments: unknown[] }>(`query { segments { id } }`)).segments).toEqual([]);
  });

  it('should audit edits but not the system counters', async () => {
    const w = await segmentWorld();
    const s = await manualSegment(w.a);
    const renamed = await updateByPk<Segment>(w.a, 'segments', s.id, { name: 'Renamed', status: 'inactive' }, SEGMENT_FIELDS);
    await runSql(`UPDATE itap.segments SET member_count = 7, last_evaluated_at = now() WHERE id = '${s.id}'`);
    const audit = await runSqlRows(
      `SELECT action FROM itap.audit_log WHERE entity = 'segments' AND entity_id = '${s.id}' ORDER BY occurred_at`,
    );
    expect(audit.map((r) => r.action)).toEqual(['insert', 'update']);
    const after = await w.a.request<{ segments_by_pk: Segment }>(`query($id: uuid!) { segments_by_pk(id: $id) { ${SEGMENT_FIELDS} } }`, {
      id: s.id,
    });
    expect(after.segments_by_pk.member_count).toBe(7);
    expect(after.segments_by_pk.updated_at).toBe(renamed?.updated_at);
  });

  it('should not delete a segment that another segment, template or event rule scope references', async () => {
    const w = await segmentWorld();
    const vip = await manualSegment(w.a, 'profiles');
    const user = await dynamicSegment(w.a, 'profiles', { field: 'member_of_segment', operator: 'in', value: [vip.id] });
    expect((await expectError(deleteByPk(w.a, 'segments', vip.id))).message).toMatch(/segment_referenced/);
    await deleteByPk(w.a, 'segments', user.id);
    const template = await insertOne(w.a, 'segment_templates', {
      name: 'VIP members',
      target: 'profiles',
      conditions: { field: 'member_of_segment', operator: 'eq', value: vip.id },
    });
    expect((await expectError(deleteByPk(w.a, 'segments', vip.id))).message).toMatch(/segment_referenced/);
    await deleteByPk(w.a, 'segment_templates', template.id);
    expect(await deleteByPk(w.a, 'segments', vip.id)).toEqual({ id: vip.id });
  });

  it('should reference segments from event rule version scopes within the organization only', async () => {
    const w = await segmentWorld();
    const mine = await manualSegment(w.a, 'identities');
    const theirs = await manualSegment(w.b, 'identities');
    const { draft } = await createRuleWithDraft(w.a, w.facility.id);
    const scope = await insertOne(w.a, 'event_rule_version_scopes', { version_id: draft.id, segment_id: mine.id }, 'id segment { id }');
    expect(scope).toMatchObject({ segment: { id: mine.id } });
    expect((await expectError(insertOne(w.a, 'event_rule_version_scopes', { version_id: draft.id, segment_id: theirs.id }))).message)
      .toMatch(/event_rule_version_scopes_segment_fkey|Foreign key violation/i);
    expect((await expectError(deleteByPk(w.a, 'segments', mine.id))).message).toMatch(/event_rule_version_scopes_segment_fkey|Foreign key/i);
  });
});

describe('segment templates', () => {
  it('should let org_admin manage own templates and keep system templates read-only', async () => {
    const w = await segmentWorld();
    const own = await insertOne<{ id: string; is_system: boolean }>(
      w.a,
      'segment_templates',
      { name: 'Frequent', target: 'identities', category: 'behavior', conditions: FREQUENT },
      'id is_system',
    );
    expect(own.is_system).toBe(false);
    await expectDenied(insertOne(w.a, 'segment_templates', { name: 'x', target: 'profiles', conditions: FREQUENT, is_system: true }), 'is_system');
    await expectDenied(updateByPk(w.a, 'segment_templates', own.id, { target: 'profiles' }), 'target');
    expect(await updateByPk(w.a, 'segment_templates', own.id, { name: 'Frequent visitors' })).toEqual({ id: own.id });
    const [sys] = await runSqlRows(
      `INSERT INTO itap.segment_templates (organization_id, name, target, conditions, is_system)
       VALUES ('${w.orgA.id}', 'System VIP', 'profiles', '{"field":"profile_type","operator":"eq","value":"vip"}', true) RETURNING id`,
    );
    const sysId = String(sys.id);
    expect(await updateByPk(w.a, 'segment_templates', sysId, { name: 'Mine now' })).toBeNull();
    expect(await deleteByPk(w.a, 'segment_templates', sysId)).toBeNull();
    // Template conditions follow the same language (an empty template is useless).
    expect((await expectError(insertOne(w.a, 'segment_templates', { name: 'Empty', target: 'profiles', conditions: {} }))).message)
      .toMatch(/segment_condition_invalid/);
    // A segment's template has the segment's target.
    expect((await expectError(dynamicSegment(w.a, 'profiles', { field: 'has_face', operator: 'eq', value: true }, { template_id: own.id }))).message)
      .toMatch(/segments_template_fkey|Foreign key/i);
    // Segments created from a template keep the link; deleting the template detaches them.
    const s = await dynamicSegment(w.a, 'identities', FREQUENT, { template_id: own.id });
    await deleteByPk(w.a, 'segment_templates', own.id);
    const [row] = await runSqlRows(`SELECT template_id FROM itap.segments WHERE id = '${s.id}'`);
    expect(row.template_id).toBe('NULL');
    const asB = asOrgAdmin(w.other.id, w.orgB.id);
    expect((await asB.request<{ segment_templates: unknown[] }>(`query { segment_templates { id } }`)).segment_templates).toEqual([]);
  });
});
