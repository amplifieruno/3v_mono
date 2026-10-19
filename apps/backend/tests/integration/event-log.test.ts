import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createArea, createFacility } from './support/facilities.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { callFn, createRuleWithDraft, insertOne } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

const insertEvent = (org: string, cols: Record<string, string>): Promise<Record<string, string | null>[]> => {
  const all: Record<string, string> = { organization_id: org, event_type: 'detection_known', title: 'Event', occurred_at: '2026-01-05T08:00:00Z', ...cols };
  const names = Object.keys(all).join(', ');
  const values = Object.values(all)
    .map((v) => `'${v}'`)
    .join(', ');
  return runSqlRows(`insert into itap.events (${names}) values (${values}) returning id, severity`);
};

describe('events', () => {
  it('should hold the full event type list from the spec', async () => {
    const rows = await runSqlRows(`select value from itap.event_types order by value`);
    expect(rows.map((r) => r.value)).toEqual(
      [
        'detection_unknown', 'detection_known', 'watchlist_match', 'blacklist_match', 'vip_arrival',
        'inactive_profile_detected', 'restricted_area_entry', 'access_granted', 'access_denied', 'tailgating',
        'loitering', 'unusual_dwell', 'after_hours', 'unexpected_facility', 'abnormal_movement', 'occupancy_exceeded',
        'device_offline', 'device_online', 'device_error', 'auth_success', 'auth_failed', 'emergency_override_started',
        'emergency_override_ended', 'saved_search_match', 'integration_failed', 'admin_action',
      ].sort(),
    );
  });

  it('should be read-only for org_admin, scoped to the organization and default to severity info', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const [row] = await insertEvent(orgA.id, { dedup_key: 'session:1:detection_known' });
    expect(row.severity).toBe('info');
    const own = await a.request<{ events: { id: string }[] }>(`query { events { id } }`);
    expect(own.events.map((e) => e.id)).toEqual([row.id]);
    await expectDenied(
      a.request(`mutation { insert_events_one(object: {event_type: "admin_action", title: "x", occurred_at: "now()"}) { id } }`),
      'insert_events_one',
    );
    await expectDenied(a.request(`mutation { update_events(where: {}, _set: {title: "x"}) { affected_rows } }`), 'update_events');
    await expectDenied(a.request(`mutation { delete_events(where: {}) { affected_rows } }`), 'delete_events');
    const b = asOrgAdmin(other.id, orgB.id);
    expect((await b.request<{ events: unknown[] }>(`query { events { id } }`)).events).toEqual([]);
  });

  it('should deduplicate per organization by dedup_key', async () => {
    const { orgA, orgB } = await createTwoOrgs();
    await insertEvent(orgA.id, { dedup_key: 'session:42:after_hours' });
    await expect(insertEvent(orgA.id, { dedup_key: 'session:42:after_hours' })).rejects.toThrow(/events_organization_id_dedup_key_key/);
    await insertEvent(orgB.id, { dedup_key: 'session:42:after_hours' });
    // ON CONFLICT DO NOTHING is the idempotent write path for Stage B.
    await runSql(
      `insert into itap.events (organization_id, event_type, title, occurred_at, dedup_key)
       values ('${orgA.id}', 'after_hours', 'x', now(), 'session:42:after_hours') on conflict (organization_id, dedup_key) do nothing`,
    );
    const rows = await runSqlRows(`select count(*) as n from itap.events where organization_id = '${orgA.id}'`);
    expect(rows[0].n).toBe('1');
  });

  it('should require a facility for an area and null the rule version when the rule is deleted', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const facility = await createFacility(a);
    const area = await createArea(a, facility.id, 'Lobby');
    await expect(insertEvent(orgA.id, { area_id: area.id })).rejects.toThrow(/events_area_needs_facility/);
    const { rule, draft } = await createRuleWithDraft(a, facility.id);
    await callFn(a, 'publish_event_rule_version', { p_version: draft.id }, 'id');
    const [event] = await insertEvent(orgA.id, { facility_id: facility.id, area_id: area.id, rule_version_id: draft.id });
    await a.request(`mutation($id: uuid!) { delete_event_rules_by_pk(id: $id) { id } }`, { id: rule.id });
    const [after] = await runSqlRows(`select rule_version_id, area_id from itap.events where id = '${event.id}'`);
    expect(after).toEqual({ rule_version_id: 'NULL', area_id: area.id });
  });

  it('should reject an unknown severity through the enum', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const err = await expectError(insertOne(a, 'watch_lists', { name: 'X', kind: 'watch', severity: 'urgent' }));
    expect(err.message).toContain('event_severities_enum');
  });
});
