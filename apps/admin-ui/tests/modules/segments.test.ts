import type { Check, Rule } from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { dailyPoints, dayIn, readStart } from '../../src/blocks/segment-stats/segment-stats-series';
import {
  EVENT_RULE_SCOPE_RESOURCE,
  SEGMENT_DAILY_STAT_RESOURCE,
  SEGMENT_RESOURCE,
  SEGMENT_TEMPLATE_RESOURCE,
} from '../../src/data/resource-names';
import { ACTION_REFUSALS } from '../../src/modules';
import { EVENT_RULE_SCOPE_CHECKS } from '../../src/modules/monitoring/event-rule-scope';
import { SEGMENT_CHECKS, conditionsEmpty } from '../../src/modules/segments/segment-checks';
import { createFromTemplateOperation } from '../../src/modules/segments/segment-ops';

/**
 * Segments, templates and daily figures without the UI: kind and target are chosen once; a
 * dynamic segment needs conditions while a manual one keeps `{}`; the active window is ordered;
 * built-in templates are read only; the refusals of a delete read as the database's reason
 * (Review Focus 5); a segment created from a template copies its target and conditions; the daily
 * figures keep days without a row as gaps; event rule scopes choose a segment by name.
 */

type FieldDef = {
  readonly kind?: string;
  readonly values?: readonly string[];
  readonly system?: boolean;
  readonly opts?: { readonly write?: string; readonly required?: boolean; readonly to?: string };
  readonly to?: string;
};
type Def = {
  readonly fields: Readonly<Record<string, FieldDef>>;
  readonly rules?: Rule[];
  readonly operations?: Record<string, boolean>;
  readonly section?: string;
  readonly actions?: { readonly item?: readonly { readonly name?: string; readonly kind?: string }[] };
};

const def = (name: string) => app.registry.get(name) as unknown as Def;
const field = (resource: string, name: string) => def(resource).fields[name];
const run = (checks: readonly Check[], id: string, ctx: Record<string, unknown>) =>
  (checks.find((check) => check.id === id)?.when as unknown as (di: Record<string, unknown>) => boolean)(ctx);
const deleteRefusal = (message: string) =>
  ACTION_REFUSALS['segments.deleteSegment']?.({ code: 'permission-error', message }, { segmentId: 'x' })?.[0];
const createRefusal = (message: string, input: unknown = {}) =>
  ACTION_REFUSALS['segments.createSegmentFromTemplate']?.({ code: 'constraint-violation', message }, input)?.[0];

beforeAll(async () => {
  await app.ready;
});

describe('segments', () => {
  it('should be listed with the people and fix kind and target at creation', () => {
    expect(def(SEGMENT_RESOURCE).section).toBe('people');
    expect(field(SEGMENT_RESOURCE, 'kind')?.values).toEqual(['manual', 'dynamic']);
    expect(field(SEGMENT_RESOURCE, 'target')?.values).toEqual(['identities', 'profiles']);
    expect(field(SEGMENT_RESOURCE, 'status')?.values).toEqual(['active', 'inactive', 'archived']);
    for (const name of ['kind', 'target']) expect(field(SEGMENT_RESOURCE, name)?.opts?.write, name).toBe('create');
    for (const name of ['member_count', 'last_evaluated_at', 'last_evaluation_error', 'last_evaluation_failed_at']) {
      expect(field(SEGMENT_RESOURCE, name)?.system, name).toBe(true);
    }
    // Only "Create segment" on a template sets it, with the template's own target.
    expect(field(SEGMENT_RESOURCE, 'template_id')?.opts?.write).toBe('never');
  });

  it('should require conditions of a dynamic segment only', () => {
    const check = (values: Record<string, unknown>, record?: Record<string, unknown>) =>
      run(SEGMENT_CHECKS, 'dynamicConditions', { values, record });
    expect(check({ kind: 'dynamic', conditions: {} })).toBe(true);
    expect(check({ kind: 'dynamic' })).toBe(true);
    expect(check({ kind: 'dynamic', conditions: { field: 'status', operator: 'eq', value: 'active' } })).toBe(false);
    expect(check({ kind: 'manual' })).toBe(false);
    // On edit the kind is the record's (fixed).
    expect(check({ conditions: {} }, { kind: 'dynamic' })).toBe(true);
    expect(conditionsEmpty({})).toBe(true);
    expect(conditionsEmpty({ op: 'and', children: [] })).toBe(false);
  });

  it('should refuse an active window that ends before it starts', () => {
    const check = (values: Record<string, unknown>) => run(SEGMENT_CHECKS, 'activeWindowOrdered', { values });
    expect(check({ active_from: '2026-11-01T08:00:00Z', active_until: '2026-11-01T08:00:00Z' })).toBe(true);
    expect(check({ active_from: '2026-11-01T08:00:00Z', active_until: '2026-10-01T08:00:00Z' })).toBe(true);
    expect(check({ active_from: '2026-11-01T08:00:00Z', active_until: '2026-12-01T08:00:00Z' })).toBe(false);
    expect(check({ active_from: '2026-11-01T08:00:00Z', active_until: null })).toBe(false);
  });

  it('should warn before archiving a segment rules are scoped to, never otherwise', async () => {
    const scoped = (rows: readonly unknown[]) => ({ list: async () => ({ data: rows }) });
    const archive = (values: Record<string, unknown>, rows: readonly unknown[], changed = true) =>
      run(SEGMENT_CHECKS, 'archiveScoped', { values, record: { id: 'seg' }, data: scoped(rows), changed: () => changed });
    expect(await archive({ status: 'archived' }, [{ id: 'scope' }])).toBe(true);
    expect(await archive({ status: 'archived' }, [])).toBe(false);
    expect(await archive({ status: 'inactive' }, [{ id: 'scope' }])).toBe(false);
    expect(await archive({ status: 'archived' }, [{ id: 'scope' }], false)).toBe(false);
    // The scopes cannot be read: a generic question instead of none.
    const failing = { list: async () => Promise.reject(new Error('offline')) };
    const ctx = { values: { status: 'archived' }, record: { id: 'seg' }, data: failing, changed: () => true };
    expect(await run(SEGMENT_CHECKS, 'archiveScoped', ctx)).toBe(false);
    expect(await run(SEGMENT_CHECKS, 'archiveUnchecked', ctx)).toBe(true);
    expect(await run(SEGMENT_CHECKS, 'archiveUnchecked', { ...ctx, data: scoped([]) })).toBe(false);
  });

  it('should say why the database refuses a delete (Review Focus 5)', () => {
    expect(deleteRefusal('Check constraint violation. segment_referenced')?.message).toMatch(
      /^This segment is named by the conditions of a notification rule, of another segment or of a segment template.*Archive the segment instead/,
    );
    const fkey = (constraint: string) =>
      `Foreign key violation. update or delete on table "segments" violates foreign key constraint "${constraint}" on table "x"`;
    expect(deleteRefusal(fkey('event_rule_version_scopes_segment_fkey'))?.message).toMatch(/^An event rule version is scoped to this segment/);
    expect(deleteRefusal(fkey('segment_members_segment_fkey'))?.message).toMatch(/^The segment has had members/);
    expect(deleteRefusal(fkey('segment_daily_stats_segment_fkey'))?.message).toMatch(/^The segment has daily figures/);
    expect(deleteRefusal(fkey('report_segments_segment_fkey'))?.code).toBe('report_segments_segment_fkey');
    // Any other refusal still names the database's words, not "may have been applied".
    expect(deleteRefusal('Check constraint violation. something_new')?.message).toContain('something_new');
    // Not a refusal: the provider's own classification stays.
    expect(ACTION_REFUSALS['segments.deleteSegment']?.({ code: 'unexpected', message: 'timeout' }, {})).toBeNull();
  });
});

describe('segment templates', () => {
  it('should keep built-in templates read only', () => {
    const denied = (action: string, record: Record<string, unknown>) =>
      (def(SEGMENT_TEMPLATE_RESOURCE).rules ?? [])
        .filter((rule) => (rule.target as { name?: string }).name === action)
        .some((rule) => (rule.when as (ctx: { record: unknown }) => boolean)({ record }));
    for (const action of ['edit', 'delete']) {
      expect(denied(action, { is_system: true }), action).toBe(true);
      expect(denied(action, { is_system: false }), action).toBe(false);
    }
    expect(field(SEGMENT_TEMPLATE_RESOURCE, 'target')?.opts?.write).toBe('create');
  });

  it('should create a dynamic segment with the template’s target and a copy of its conditions', () => {
    const conditions = { field: 'visits_last_30d', operator: 'gte', value: 8 };
    const variables = createFromTemplateOperation.document.variables?.({
      templateId: 'tpl',
      target: 'profiles',
      conditions,
      name: '  Regulars ',
      description: ' ',
    });
    expect(variables).toEqual({ name: 'Regulars', description: null, target: 'profiles', conditions, template: 'tpl' });
    expect(String(createFromTemplateOperation.document.document)).toMatch(/kind: dynamic/);
    expect(def(SEGMENT_TEMPLATE_RESOURCE).actions?.item?.find((action) => action.name === 'create_segment')?.kind).toBe('flow');
  });

  it('should say why a segment from a template is refused', () => {
    expect(
      createRefusal('Uniqueness violation. duplicate key value violates unique constraint "segments_organization_id_name_key"')?.message,
    ).toBe('A segment of this name already exists: choose another name. Nothing was created.');
    expect(createRefusal('Check constraint violation. segment_condition_invalid:$.children[1].field')?.message).toContain(
      '($.children[1].field)',
    );
    // The refused condition is named from the conditions the flow sent (Review Focus 2).
    const conditions = { op: 'and', children: [{ field: 'status', operator: 'eq', value: 'active' }, { field: 'custom_fields.shift', operator: 'eq', value: 'day' }] };
    expect(createRefusal('Check constraint violation. segment_condition_invalid:$.children[1].field', { conditions })?.message).toBe(
      'The template’s conditions are no longer valid here (the field of the condition on “custom_fields.shift” (2)): a field or a record they name may have changed. Nothing was created.',
    );
  });
});

describe('segment daily figures', () => {
  it('should be read only', () => {
    expect(def(SEGMENT_DAILY_STAT_RESOURCE).operations).toMatchObject({ create: false, edit: false, delete: false });
  });

  it('should give every day of the window a point and keep a day without a row as a gap', () => {
    const now = new Date('2026-10-22T15:00:00Z');
    const series = dailyPoints(
      {
        timezone: 'Europe/Berlin',
        rows: [
          { day: '2026-10-20', member_count: 4, added: 4, removed: 0 },
          { day: '2026-10-22', member_count: 3, added: 0, removed: 1 },
          { day: '2026-08-01', member_count: 9, added: 0, removed: 0 },
        ],
      },
      now,
    );
    expect(series.points).toHaveLength(30);
    expect(series.points[0]?.day).toBe('2026-09-23');
    expect(series.points.at(-1)).toEqual({ day: '2026-10-22', members: 3, added: 0, removed: 1 });
    expect(series.points.at(-2)).toEqual({ day: '2026-10-21', members: null, added: null, removed: null });
    expect(series.points.at(-3)?.members).toBe(4);
  });

  it('should end the window on the organization’s day, not the browser’s (I1)', () => {
    // 22:30 UTC on 22 October is already 23 October in Tokyo and still 22 October in New York.
    const now = new Date('2026-10-22T22:30:00Z');
    expect(dayIn(now, 'Asia/Tokyo')).toBe('2026-10-23');
    expect(dayIn(now, 'America/New_York')).toBe('2026-10-22');
    expect(dayIn(now, 'Not/AZone')).toBe('2026-10-22');
    const rows = [{ day: '2026-10-23', member_count: 7, added: 1, removed: 0 }];
    expect(dailyPoints({ timezone: 'Asia/Tokyo', rows }, now).points.at(-1)?.members).toBe(7);
    expect(dailyPoints({ timezone: 'America/New_York', rows }, now).points.at(-1)?.day).toBe('2026-10-22');
    // The read reaches past the window's first day in any zone.
    expect(readStart(now)).toBe('2026-09-20');
    expect(dailyPoints({ timezone: 'Asia/Tokyo', rows }, now).points[0]?.day).toBe('2026-09-24');
  });
});

describe('event rule scopes', () => {
  it('should choose a segment by name and allow one target per row', () => {
    const segment = field(EVENT_RULE_SCOPE_RESOURCE, 'segment_id');
    expect(segment?.kind).toBe('relation');
    expect(segment?.system).not.toBe(true);
    // Only active segments are offered.
    expect(JSON.stringify(segment)).toContain('"candidates":[{"field":"status","op":"eq","value":"active"}]');
    const check = (values: Record<string, unknown>) => run(EVENT_RULE_SCOPE_CHECKS, 'scopeExactlyOne', { values });
    expect(check({ segment_id: 'seg' })).toBe(false);
    expect(check({ facility_id: 'fac', segment_id: 'seg' })).toBe(true);
    expect(check({})).toBe(true);
  });
});
