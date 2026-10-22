// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * The camera page's recognition control, health and events: Start is offered while recognition
 * is off and Stop once the action returned (the device and the status facts re-read: Review
 * Focus 5); a terminal shows neither and never asks for a recognition status; the Health tab
 * charts the samples and lists them; the Events tab is a timeline of the device's events.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const TOWER_F = '55555555-5555-4555-8555-555555555555';
const CAMERA = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const TERMINAL = 'cccccccc-cccc-4ccc-8ccc-000000000002';

const base = {
  facility_id: TOWER_F,
  area_id: null,
  position: null,
  coverage: null,
  stream_url: null,
  resolution: null,
  fps: null,
  status: 'active',
  health_status: 'healthy',
  last_seen_at: '2026-10-20T10:00:00Z',
  manufacturer: null,
  model: null,
  firmware_version: null,
  ip_address: null,
  configuration: {},
  custom_fields: {},
  recognition_enabled: false,
  recognition_fps: 1,
  username: null,
  policy_version_synced: null,
  policy_synced_at: null,
  policy_sync_error: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

let enabled = false;

const devices = () => [
  {
    ...base,
    id: CAMERA,
    code: 'DEVICE-00001',
    name: 'Entrance camera',
    device_type: 'static_video_camera',
    stream_url: 'rtsp://stream-server:8554/entrance',
    recognition_enabled: enabled,
  },
  { ...base, id: TERMINAL, code: 'DEVICE-00002', name: 'Lobby terminal', device_type: 'access_terminal' },
];

const status = () => ({
  device_id: CAMERA,
  enabled,
  running: enabled,
  fps: 1,
  frames_processed: enabled ? 42 : 0,
  frames_dropped: 0,
  faces_detected: 0,
  faces_suppressed: 0,
  detections: enabled ? 7 : 0,
  last_frame_at: null,
  last_error: null,
});

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const SAMPLES = [
  { recorded_at: minutesAgo(90), cpu_usage: null, memory_usage: null, network_latency_ms: 20, frame_rate: null, error_count: 0 },
  { recorded_at: minutesAgo(30), cpu_usage: null, memory_usage: null, network_latency_ms: null, frame_rate: null, error_count: 1 },
  { recorded_at: minutesAgo(5), cpu_usage: null, memory_usage: null, network_latency_ms: 35, frame_rate: null, error_count: 0 },
];

const EVENTS = [
  {
    id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
    device_id: CAMERA,
    kind: 'offline',
    message: 'Device is unreachable',
    payload: {},
    occurred_at: minutesAgo(30),
    created_at: minutesAgo(30),
  },
];

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  if (query.includes('recognition_start(')) {
    enabled = true;
    return hasuraResponse({ data: { recognition_start: status() } });
  }
  if (query.includes('recognition_stop(')) {
    enabled = false;
    return hasuraResponse({ data: { recognition_stop: status() } });
  }
  if (query.includes('recognition_status(')) return hasuraResponse({ data: { recognition_status: status() } });
  if (query.includes('DeviceHealthSeries')) {
    return hasuraResponse({ data: { device_health_metrics: SAMPLES } });
  }
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('devices_by_pk')) {
    return hasuraResponse({ data: { item: devices().find((d) => d.id === variables?.id) ?? null } });
  }
  if (/\bitems: devices\(/.test(query)) return hasuraResponse({ data: { items: devices() } });
  if (/\bitems: device_health_metrics\(/.test(query)) {
    return hasuraResponse({
      data: { items: SAMPLES.map((s, i) => ({ ...s, id: `m${i}`, device_id: CAMERA, disk_usage: null, created_at: s.recorded_at })) },
    });
  }
  if (/\bitems: device_events\(/.test(query)) return hasuraResponse({ data: { items: EVENTS } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

beforeAll(installDomShims);

beforeEach(() => {
  enabled = false;
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('recognition control on the camera page', () => {
  it('should offer Start while off, then Stop and the running status once the action returned', async () => {
    renderAt(`/devices/${CAMERA}`);
    const startButton = await screen.findByRole('button', { name: /^Start recognition$/ });
    expect(screen.queryByRole('button', { name: /^Stop recognition$/ })).toBeNull();
    expect(await screen.findByText('Running now')).toBeDefined();

    fireEvent.click(startButton);
    await waitFor(() =>
      expect(bodies().filter((b) => b.query.includes('recognition_start('))).toHaveLength(1),
    );
    expect(bodies().find((b) => b.query.includes('recognition_start('))?.variables).toEqual({
      device: CAMERA,
    });
    expect(await screen.findByRole('button', { name: /^Stop recognition$/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Start recognition$/ })).toBeNull();
    expect(await screen.findByText('42')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /^Stop recognition$/ }));
    expect(await screen.findByRole('button', { name: /^Start recognition$/ })).toBeDefined();
    expect(bodies().filter((b) => b.query.includes('recognition_stop('))).toHaveLength(1);
  });

  it('should show neither action nor a recognition status on a terminal', async () => {
    renderAt(`/devices/${TERMINAL}`);
    await screen.findAllByRole('heading', { name: /Lobby terminal/ });
    await screen.findByRole('tab', { name: 'Details' });
    expect(screen.queryByRole('button', { name: /recognition/i })).toBeNull();
    expect(screen.queryByText('Running now')).toBeNull();
    expect(bodies().some((b) => b.query.includes('recognition_status('))).toBe(false);
  });
});

describe('device health and events tabs', () => {
  it('should chart the latency, mark the failed check and list the samples', async () => {
    renderAt(`/devices/${CAMERA}?sections=health`);
    const chart = await screen.findByTestId('health-chart:latency');
    expect(within(chart).getByText('Latency')).toBeDefined();
    expect(within(chart).getByText(/latest 35 ms/)).toBeDefined();
    expect(screen.queryByTestId('health-chart:cpu')).toBeNull();
    expect(screen.getAllByTestId('health-chart-error')).toHaveLength(1);
    expect(await screen.findByRole('columnheader', { name: /Latency \(ms\)/ })).toBeDefined();
  });

  it('should list the device’s events as a timeline', async () => {
    renderAt(`/devices/${CAMERA}?sections=events`);
    expect((await screen.findAllByText('Device is unreachable')).length).toBeGreaterThan(0);
    const reads = bodies().filter((b) => /\bitems: device_events\(/.test(b.query));
    expect(JSON.stringify(reads.at(-1))).toContain(CAMERA);
    expect(bodies().some((b) => b.query.includes('device_events_aggregate'))).toBe(false);
  });
});
