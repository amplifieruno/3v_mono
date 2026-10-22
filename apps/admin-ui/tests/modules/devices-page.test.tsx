// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleApp } from '../../src/app/app';
import { facilityStorageKey } from '../../src/app/scope';
import { fakeAdminAuth, hasuraResponse, installDomShims } from '../support/console-dom';

/**
 * Device screens: the password is write-only (never selected, never sent unless a new one is
 * typed: Review Focus 3), each device type shows its own fields (a camera its stream, a
 * terminal its policy sync), the list follows the sidebar facility, and the Areas tab adds a
 * covered area in the device's facility.
 */

const NOVA = '11111111-1111-4111-8111-111111111111';
const TOWER_F = '55555555-5555-4555-8555-555555555555';
const DEPOT_F = '66666666-6666-4666-8666-666666666666';
const LOBBY = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const CAMERA = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const TERMINAL = 'cccccccc-cccc-4ccc-8ccc-000000000002';
const SENSOR = 'cccccccc-cccc-4ccc-8ccc-000000000003';

const base = {
  facility_id: TOWER_F,
  area_id: LOBBY,
  position: null,
  coverage: null,
  stream_url: null,
  resolution: null,
  fps: null,
  status: 'active',
  health_status: 'healthy',
  last_seen_at: '2026-10-20T10:00:00Z',
  manufacturer: 'Hikvision',
  model: 'DS-2CD',
  firmware_version: '5.7',
  ip_address: '10.0.0.20',
  configuration: {},
  custom_fields: {},
  recognition_enabled: false,
  recognition_fps: 1,
  username: 'admin',
  policy_version_synced: null,
  policy_synced_at: null,
  policy_sync_error: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const DEVICES = [
  {
    ...base,
    id: CAMERA,
    code: 'DEVICE-00001',
    name: 'Entrance camera',
    device_type: 'static_video_camera',
    stream_url: 'rtsp://stream-server:8554/entrance',
    resolution: '1920x1080',
    fps: 25,
  },
  {
    ...base,
    id: TERMINAL,
    code: 'DEVICE-00002',
    name: 'Lobby terminal',
    device_type: 'access_terminal',
    policy_version_synced: 12,
    policy_synced_at: '2026-10-20T09:00:00Z',
    policy_sync_error: 'Terminal timed out',
  },
  {
    ...base,
    id: SENSOR,
    code: 'DEVICE-00003',
    name: 'Dock door contact',
    device_type: 'sensor',
    facility_id: DEPOT_F,
    area_id: null,
  },
];

const FACILITIES = [
  { id: TOWER_F, code: 'FACILITY-00001', name: 'Nova Tower', status: 'active', timezone: 'UTC' },
  { id: DEPOT_F, code: 'FACILITY-00002', name: 'Depot', status: 'active', timezone: 'UTC' },
];

const AREAS = [{ id: LOBBY, facility_id: TOWER_F, parent_id: null, name: 'Lobby', path: [LOBBY] }];

interface GraphqlBody {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
}

const bodies = (): GraphqlBody[] =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url).includes('graphql'))
    .map(([, init]) => JSON.parse(String(init?.body)) as GraphqlBody);

const mutations = (): GraphqlBody[] =>
  bodies().filter((body) => body.query.trimStart().startsWith('mutation'));

async function serve(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const { query, variables } = JSON.parse(String(init?.body)) as GraphqlBody;
  const text = `${query} ${JSON.stringify(variables ?? {})}`;
  if (query.trimStart().startsWith('mutation')) return hasuraResponse({ data: { item: DEVICES[0] } });
  if (query.includes('_aggregate')) return hasuraResponse({ data: { meta: { aggregate: { count: 1 } } } });
  if (query.includes('devices_by_pk')) {
    return hasuraResponse({ data: { item: DEVICES.find((d) => d.id === variables?.id) ?? null } });
  }
  if (query.includes('facilities_by_pk')) {
    return hasuraResponse({ data: { item: FACILITIES.find((f) => f.id === variables?.id) ?? null } });
  }
  if (query.includes('areas_by_pk')) return hasuraResponse({ data: { item: AREAS[0] } });
  if (/\bitems: devices\(/.test(query)) {
    const only = [TOWER_F, DEPOT_F].find((f) => text.includes(f));
    return hasuraResponse({ data: { items: DEVICES.filter((d) => !only || d.facility_id === only) } });
  }
  if (/\bitems: areas\(/.test(query)) return hasuraResponse({ data: { items: AREAS } });
  if (/\bitems: facilities\(/.test(query)) return hasuraResponse({ data: { items: FACILITIES } });
  return hasuraResponse({ data: { items: [] } });
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ConsoleApp auth={fakeAdminAuth(NOVA, 'Nova Tower Business Center')} />
    </MemoryRouter>,
  );

const passwordBox = (): HTMLInputElement =>
  screen.getByLabelText(/^New password/) as HTMLInputElement;

beforeAll(installDomShims);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(serve));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('device password (write-only)', () => {
  it('should never select the password', async () => {
    renderAt(`/devices/${CAMERA}/edit`);
    await screen.findByDisplayValue('Entrance camera');
    const reads = bodies().filter((body) => /devices(_by_pk)?\(/.test(body.query));
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.some((body) => /\bpassword\b/.test(body.query))).toBe(false);
    expect(passwordBox().value).toBe('');
    expect(passwordBox().type).toBe('password');
  });

  it('should save an edit without touching the password and never send password', async () => {
    renderAt(`/devices/${CAMERA}/edit`);
    fireEvent.change(await screen.findByDisplayValue('Entrance camera'), {
      target: { value: 'Main entrance camera' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const set = mutations()[0]?.variables?.set as Record<string, unknown>;
    expect(set.name).toBe('Main entrance camera');
    expect(Object.hasOwn(set, 'password')).toBe(false);
    expect(JSON.stringify(mutations()[0])).not.toContain('password');
  });

  it('should leave out a password typed and cleared again', async () => {
    renderAt(`/devices/${CAMERA}/edit`);
    await screen.findByDisplayValue('Entrance camera');
    fireEvent.change(passwordBox(), { target: { value: 'secret-1' } });
    fireEvent.change(passwordBox(), { target: { value: '' } });
    fireEvent.change(screen.getByDisplayValue('Hikvision'), { target: { value: 'Axis' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const set = mutations()[0]?.variables?.set as Record<string, unknown>;
    expect(set.manufacturer).toBe('Axis');
    expect(Object.hasOwn(set, 'password')).toBe(false);
  });

  it('should send a newly typed password', async () => {
    renderAt(`/devices/${CAMERA}/edit`);
    await screen.findByDisplayValue('Entrance camera');
    fireEvent.change(passwordBox(), { target: { value: 'n3w-secret' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect((mutations()[0]?.variables?.set as Record<string, unknown>).password).toBe('n3w-secret');
  });
});

describe('device types', () => {
  it('should show a camera’s stream and not a terminal’s policy sync', async () => {
    renderAt(`/devices/${CAMERA}?sections=stream`);
    expect(await screen.findByText('rtsp://stream-server:8554/entrance')).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Stream' })).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'Access policies' })).toBeNull();
  });

  it('should show a terminal’s policy sync and not a stream', async () => {
    renderAt(`/devices/${TERMINAL}?sections=policy`);
    expect(await screen.findByText('Terminal timed out')).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'Stream' })).toBeNull();
  });

  it('should offer neither stream nor policy fields on a sensor’s form', async () => {
    localStorage.setItem(facilityStorageKey(NOVA), DEPOT_F);
    renderAt(`/devices/${SENSOR}/edit`);
    await screen.findByDisplayValue('Dock door contact');
    expect(screen.queryByLabelText(/^Stream URL/)).toBeNull();
    expect(screen.queryByLabelText(/^Recognition rate/)).toBeNull();
    expect(passwordBox()).toBeDefined();
  });

  it('should ask for the type before the create form', async () => {
    renderAt('/devices/create');
    for (const label of ['Static camera', 'PTZ camera', 'Thermal camera', 'Access terminal', 'Sensor']) {
      expect(await screen.findByText(label)).toBeDefined();
    }
    expect(screen.queryByRole('textbox', { name: /^Name/ })).toBeNull();
  });

  it('should create a camera of the chosen type with its recognition rate', async () => {
    renderAt(`/devices/create?type=ptz_camera&prefill.facility_id=${TOWER_F}`);
    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Atrium PTZ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /^Stream URL/ }), {
      target: { value: 'rtsp://cam:pw@10.0.0.30/live' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    expect(
      await screen.findByText(
        'Leave the user name and password out of the address; enter them under Credentials.',
      ),
    ).toBeDefined();
    expect(mutations()).toHaveLength(0);

    fireEvent.change(screen.getByRole('textbox', { name: /^Stream URL/ }), {
      target: { value: 'rtsp://10.0.0.30/live' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create|Save/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    const object = mutations()[0]?.variables?.object as Record<string, unknown>;
    expect(object).toMatchObject({
      device_type: 'ptz_camera',
      facility_id: TOWER_F,
      name: 'Atrium PTZ',
      stream_url: 'rtsp://10.0.0.30/live',
      recognition_fps: 1,
      status: 'active',
    });
    expect(Object.hasOwn(object, 'password')).toBe(false);
    expect(Object.hasOwn(object, 'recognition_enabled')).toBe(false);
  });
});

describe('device list and areas', () => {
  it('should follow the sidebar facility picker', async () => {
    localStorage.setItem(facilityStorageKey(NOVA), DEPOT_F);
    renderAt('/devices');
    expect(await screen.findByRole('row', { name: /Dock door contact/ })).toBeDefined();
    expect(screen.queryByRole('row', { name: /Entrance camera/ })).toBeNull();
  });

  it('should add a covered area in the device’s facility from the Areas tab', async () => {
    renderAt(`/devices/${CAMERA}?sections=areas`);
    await screen.findByRole('tab', { name: 'Areas', selected: true });
    fireEvent.click(await screen.findByRole('button', { name: /Create/ }));
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.scrollIntoView ??= () => undefined;
    const sheet = await screen.findByRole('dialog');
    fireEvent.click(await within(sheet).findByRole('combobox', { name: /^Area/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Lobby/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: /^(Create|Save)/ }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(mutations()[0]?.variables?.object).toEqual({
      device_id: CAMERA,
      facility_id: TOWER_F,
      area_id: LOBBY,
    });
  });
});
