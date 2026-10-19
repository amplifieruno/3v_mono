import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createFacility } from './support/facilities.js';
import { expectError } from './support/fixtures.js';
import { notificationRule, notificationWorld, orgDeliveries, recipientGroup, unknownArrival } from './support/notifications.js';
import { deleteByPk, updateByPk } from './support/operations.js';
import { asActor, dynamicSegment, manualSegment, segmentWorld, syncMembers } from './support/segments.js';
import { runSql } from './support/sql.js';
import { evaluate, knownPerson, orgEvents, publishedRule } from './support/stageB.js';
import { createIdentity, detect } from './support/tracking.js';

/**
 * Segment scopes (slice 6, task 3): an event rule version scoped to a segment applies to an event only when the
 * event's identity (identity segments) or profile (profile segments) is a member at the event time; facility / area
 * scopes and segment scopes combine with AND (any scope of each kind). Notification rules get the condition key
 * segment_id with the same membership semantics. Membership is back-dated before the fixed tracking clock.
 */

const BEFORE = '2026-01-01T00:00:00.000Z';
/** Conditions nobody matches: membership comes from the explicit sync only (a live evaluation would only close it). */
const nobody = (target: string) =>
  target === 'identities'
    ? { field: 'detection_count', operator: 'lt', value: 0 }
    : { field: 'department', operator: 'eq', value: `nobody-${Date.now()}` };

/** A dynamic segment whose rule members are exactly `ids` since BEFORE. */
async function segmentOf(w: { a: Parameters<typeof dynamicSegment>[0]; orgA: { id: string } }, target: string, ids: string[]) {
  const segment = await dynamicSegment(w.a, target, nobody(target));
  await syncMembers(asActor(w.orgA.id), segment.id, ids, BEFORE);
  return segment;
}

const restricted = <T extends { event_type: string }>(events: T[]): T[] => events.filter((e) => e.event_type === 'restricted_area_entry');

describe('event rule segment scopes', () => {
  it('should apply a segment-scoped rule only to members at the event time (Stage B through a detection)', async () => {
    const w = await segmentWorld();
    await updateByPk(w.a, 'areas', w.zone.id, { access_level: 'classified' });
    const outsider = await createIdentity(w.a);
    const lateJoiner = await createIdentity(w.a);
    const segment = await segmentOf(w, 'identities', [w.identity]);
    const rule = await publishedRule(w.a, 'restricted_area', { severity: 'critical' }, [{ segment_id: segment.id }]);
    // Joins after the detections below: not a member at their time.
    await syncMembers(asActor(w.orgA.id), segment.id, [w.identity, lateJoiner], new Date().toISOString());

    for (const [i, id] of [w.identity, outsider, lateJoiner].entries()) {
      await evaluate((await detect(w.orgA.id, w.floorCam, id, i * 10)).id);
    }
    const events = restricted(await orgEvents(w.orgA.id));
    const byIdentity = Object.fromEntries(events.map((e) => [e.identity_id, e]));
    expect(byIdentity[w.identity]).toMatchObject({ severity: 'critical', rule_version_id: rule.version });
    expect(byIdentity[outsider].rule_version_id).toBeNull();
    expect(byIdentity[lateJoiner].rule_version_id).toBeNull();
  });

  it('should match profile segments through the event profile and AND location scopes with segment scopes', async () => {
    const w = await segmentWorld();
    await updateByPk(w.a, 'areas', w.zone.id, { access_level: 'classified' });
    const member = await knownPerson(w.a);
    const other = await knownPerson(w.a);
    const segment = await segmentOf(w, 'profiles', [member.profile]);
    const elsewhere = await createFacility(w.a);
    // Segment matches but the facility does not: never applies.
    await publishedRule(w.a, 'restricted_area', { severity: 'critical' }, [{ segment_id: segment.id }, { facility_id: elsewhere.id }]);
    const here = await publishedRule(w.a, 'restricted_area', { severity: 'high' }, [
      { segment_id: segment.id },
      { facility_id: w.facility.id },
    ]);
    await evaluate((await detect(w.orgA.id, w.floorCam, member.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.floorCam, other.identity, 5)).id);
    const events = restricted(await orgEvents(w.orgA.id));
    expect(events.find((e) => e.profile_id === member.profile)).toMatchObject({ rule_version_id: here.version, severity: 'high' });
    expect(events.find((e) => e.profile_id === other.profile)?.rule_version_id).toBeNull();
  });
});

describe('notification rule segment condition', () => {
  it('should validate segment_id: a segment of the organization, any target', async () => {
    const w = await segmentWorld();
    const own = await manualSegment(w.a, 'identities');
    const foreign = await manualSegment(w.b, 'profiles');
    const ok = await notificationRule(w.a, ['detection_unknown'], ['in_app'], { conditions: { segment_id: own.id } });
    expect(ok).toBeTruthy();
    for (const conditions of [{ segment_id: foreign.id }, { segment_id: 'nope' }, { segment_id: 7 }]) {
      const err = await expectError(notificationRule(w.a, ['detection_unknown'], ['in_app'], { conditions }));
      expect(err.message).toMatch(/notification_rule_conditions_invalid/);
    }
    // A segment named by a notification rule cannot be deleted.
    const err = await expectError(deleteByPk(w.a, 'segments', own.id));
    expect(err.message).toMatch(/segment_referenced/);
  });

  it('should notify only for events of segment members at the event time', async () => {
    const w = await notificationWorld();
    const outsider = await createIdentity(w.a);
    const segment = await segmentOf(w, 'identities', [w.identity]);
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const rule = await notificationRule(w.a, ['detection_unknown'], ['in_app'], {
      recipient_group_id: group,
      conditions: { segment_id: segment.id },
    });
    const memberEvent = await unknownArrival(w, 0, w.identity);
    await unknownArrival(w, 5, outsider);
    const deliveries = await orgDeliveries(w.orgA.id);
    expect(deliveries.map((d) => [d.rule_id, d.event_id, d.recipient_user_id])).toEqual([[rule, memberEvent.id, w.bob]]);
  });
});

type TestRow = {
  event_id: string;
  event_type: string;
  would_match: boolean;
  reason: string;
  recipient_count: number;
  recipients: { channel: string; user_id: string | null; address: string | null }[];
};

async function testRule(client: Parameters<typeof dynamicSegment>[0], rule: string, limit?: number): Promise<TestRow[]> {
  const data = await client.request<{ test_notification_rule: TestRow[] }>(
    `query($r: uuid!, $l: Int) { test_notification_rule(args: {p_rule: $r, p_limit: $l}) {
       event_id event_type would_match reason recipient_count recipients } }`,
    { r: rule, l: limit },
  );
  return data.test_notification_rule;
}

describe('test_notification_rule', () => {
  it('should dry-run a rule against the latest events with expanded recipients and write nothing', async () => {
    const w = await notificationWorld();
    const outsider = await createIdentity(w.a);
    const person = await knownPerson(w.a);
    const segment = await segmentOf(w, 'identities', [w.identity, person.identity]);
    const group = await recipientGroup(w.a, [
      { user_id: w.bob, channel: 'in_app' },
      { user_id: w.carol, channel: 'in_app' },
      { user_id: w.user.id, channel: 'email' },
      { external_address: 'desk@example.com', channel: 'email' },
      { external_address: '+15551234567', channel: 'sms' },
    ]);
    await runSql(
      `update itap.organization_members set status = 'deactivated', deactivated_at = now() where organization_id = '${w.orgA.id}' and user_id = '${w.carol}';
       update itap.organization_members set vacation_until = '2027-01-01', vacation_delegate_user_id = '${w.bob}' where organization_id = '${w.orgA.id}' and user_id = '${w.user.id}'`,
    );
    // Inactive: Stage C ignores it, the dry run does not.
    const rule = await notificationRule(w.a, ['detection_unknown'], ['in_app', 'email'], {
      recipient_group_id: group,
      conditions: { segment_id: segment.id },
      is_active: false,
    });
    const member = await unknownArrival(w, 0, w.identity);
    const nonMember = await unknownArrival(w, 5, outsider);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, person.identity, 10)).id);
    const known = (await orgEvents(w.orgA.id)).filter((e) => e.event_type !== 'detection_unknown').map((e) => e.id);

    const rows = await testRule(w.a, rule, 20);
    expect(rows.map((r) => r.event_id).slice(-2)).toEqual([nonMember.id, member.id]);
    expect(rows.filter((r) => known.includes(r.event_id)).every((r) => r.reason === 'event_type_mismatch' && !r.would_match)).toBe(true);
    expect(rows.find((r) => r.event_id === nonMember.id)).toMatchObject({ would_match: false, reason: 'condition_mismatch', recipient_count: 0, recipients: [] });
    const match = rows.find((r) => r.event_id === member.id);
    expect(match).toMatchObject({ would_match: true, reason: 'match', recipient_count: 3 });
    // carol is deactivated; the user is on vacation -> bob (delegate) by email; sms is not a rule channel.
    expect(match?.recipients).toEqual([
      { channel: 'email', user_id: null, address: 'desk@example.com' },
      { channel: 'email', user_id: w.bob, address: null },
      { channel: 'in_app', user_id: w.bob, address: null },
    ]);
    expect(await testRule(w.a, rule, 1)).toHaveLength(1);
    expect(await orgDeliveries(w.orgA.id)).toEqual([]);

    // Another organization's rule is not found.
    const foreign = await notificationRule(asOrgAdmin(w.other.id, w.orgB.id), ['detection_unknown'], ['in_app']);
    const err = await expectError(testRule(w.a, foreign));
    expect(err.message).toMatch(/notification_rule_not_found/);
  });
});
