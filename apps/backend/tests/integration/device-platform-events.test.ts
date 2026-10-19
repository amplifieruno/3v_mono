import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { createArea, createDevice, createFacility } from './support/facilities.js';
import { createTwoOrgs } from './support/fixtures.js';
import { orgEvents } from './support/stageB.js';

const RECORD = `
  mutation Record($device: uuid!, $reachable: Boolean!, $frame: Boolean!, $at: timestamptz!) {
    record_device_health(args: { p_device: $device, p_reachable: $reachable, p_latency_ms: 12, p_frame_ok: $frame, p_checked_at: $at }) { id }
  }
`;

const minute = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString();

async function setup() {
  const { orgA, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const facility = await createFacility(a);
  const area = await createArea(a, facility.id, 'Lobby');
  const device = await createDevice(a, facility.id, { area_id: area.id, stream_url: 'rtsp://mediamtx:8554/lobby' });
  const record = (reachable: boolean, n: number, frame = reachable) =>
    asAdmin().request(RECORD, { device: device.id, reachable, frame, at: minute(n) });
  return { orgA, facility, area, device, record };
}

describe('record_device_health platform events', () => {
  it('should mirror health transitions as device_offline / device_online / device_error events', async () => {
    const s = await setup();
    await s.record(true, 0);
    await s.record(false, 1);
    await s.record(false, 2);
    await s.record(true, 3, false);
    await s.record(true, 4);
    const events = await orgEvents(s.orgA.id);
    expect(events.map((e) => [e.event_type, e.severity, Date.parse(e.occurred_at)])).toEqual([
      ['device_offline', 'high', Date.parse(minute(1))],
      ['device_error', 'medium', Date.parse(minute(3))],
      ['device_online', 'info', Date.parse(minute(3))],
    ]);
    expect(events[0]).toMatchObject({
      device_id: s.device.id,
      facility_id: s.facility.id,
      area_id: s.area.id,
      identity_id: null,
      dedup_key: `device:${s.device.id}:device_offline:${Date.parse(minute(1))}`,
    });
  });

  it('should not duplicate platform events when a cron run is retried', async () => {
    const s = await setup();
    await s.record(false, 0);
    await s.record(false, 0);
    await s.record(true, 1);
    await s.record(true, 1);
    expect((await orgEvents(s.orgA.id)).map((e) => e.event_type)).toEqual(['device_offline', 'device_online']);
  });
});
