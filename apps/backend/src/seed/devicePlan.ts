import type { OrgKey } from './companies.js';
import { floorName } from './facilityPlan.js';

/**
 * Seed access points and devices. Areas are referenced by their path key (see facilityPlan); positions are points in
 * the floor plan of the nearest ancestor area with a plan (none when that area has no plan).
 */
export type Point = [number, number];

export type AccessPointSpec = {
  name: string;
  kind: 'door' | 'turnstile' | 'gate' | 'elevator' | 'reception';
  direction?: 'in' | 'out' | 'both';
  area: string;
  fromArea?: string;
  position?: Point;
  isEntryExit?: boolean;
};

export type DeviceSpec = {
  name: string;
  type: 'static_video_camera' | 'ptz_camera' | 'thermal_camera' | 'access_terminal' | 'sensor';
  area: string;
  /** Further covered areas (device_areas). */
  covers?: string[];
  position?: Point;
  coverage?: { center: Point; radius: number };
  /** Stream-server stream id (cameras only); stream_url = rtsp://mediamtx:8554/<id>, no credentials. */
  stream?: string;
  manufacturer: string;
  model: string;
  firmware: string;
  ip: string;
  configuration?: Record<string, unknown>;
  /** Access points the device is installed at, with its role there. */
  accessPoints?: { name: string; role: 'camera' | 'terminal' | 'sensor' }[];
};

const LOBBY = 'Nova Tower/Lobby';
const P1 = 'Nova Tower/Parking/Parking Level P-1';
const FLOOR3 = `Nova Tower/${floorName(3)}`;
const FLOOR24 = `Nova Tower/${floorName(24)}`;

const TURNSTILE_X = [480, 560, 640, 720];
const turnstiles = TURNSTILE_X.map((x, i) => ({ name: `Turnstile ${i + 1}`, x }));

const NOVA_ACCESS_POINTS: AccessPointSpec[] = [
  {
    name: 'Main Entrance Doors',
    kind: 'door',
    area: `${LOBBY}/Main Entrance`,
    position: [660, 780],
    isEntryExit: true,
  },
  ...turnstiles.map((t): AccessPointSpec => ({
    name: t.name,
    kind: 'turnstile',
    area: `${LOBBY}/Elevator Hall`,
    fromArea: `${LOBBY}/Turnstile Gallery`,
    position: [t.x, 440],
  })),
  { name: 'Reception Desk', kind: 'reception', area: `${LOBBY}/Reception`, fromArea: `${LOBBY}/Main Entrance`, position: [220, 570] },
  { name: 'Server Room Door', kind: 'door', direction: 'both', area: `${FLOOR3}/Server Room`, fromArea: FLOOR3 },
  {
    name: 'Executive Floor Door',
    kind: 'door',
    area: `${FLOOR24}/Executive Offices`,
    fromArea: `${FLOOR24}/Executive Reception`,
  },
  { name: 'Parking Gate', kind: 'gate', area: P1, fromArea: `${P1}/Entrance Ramp`, position: [170, 600], isEntryExit: true },
  { name: 'Loading Dock Door', kind: 'door', area: `${LOBBY}/Loading Dock`, position: [1020, 60], isEntryExit: true },
];

const camera = { type: 'static_video_camera', manufacturer: 'Axis', model: 'P3265-LVE', firmware: '11.8.64' } as const;
const terminal = { type: 'access_terminal', manufacturer: 'ZKTeco', model: 'SpeedFace-V5L', firmware: '6.60.1' } as const;
const sensor = { type: 'sensor', manufacturer: 'Milesight', model: 'AM307', firmware: '1.4.2' } as const;
const faceMode = { mode: 'face', door_open_ms: 3000 };

const NOVA_DEVICES: DeviceSpec[] = [
  {
    ...camera,
    name: 'Main Entrance Camera',
    stream: 'entrance',
    area: `${LOBBY}/Main Entrance`,
    covers: [`${LOBBY}/Turnstile Gallery`],
    position: [560, 700],
    coverage: { center: [600, 640], radius: 150 },
    ip: '10.10.0.11',
    accessPoints: [{ name: 'Main Entrance Doors', role: 'camera' }],
  },
  {
    ...camera,
    name: 'Lobby Camera',
    stream: 'lobby',
    area: `${LOBBY}/Lobby Lounge`,
    covers: [`${LOBBY}/Reception`, `${LOBBY}/Turnstile Gallery`],
    position: [960, 520],
    coverage: { center: [760, 560], radius: 230 },
    ip: '10.10.0.12',
    accessPoints: [...turnstiles.map((t) => ({ name: t.name, role: 'camera' as const })), { name: 'Reception Desk', role: 'camera' }],
  },
  {
    ...camera,
    name: 'Server Room Camera',
    stream: 'serverroom',
    area: `${FLOOR3}/Server Room`,
    ip: '10.10.3.11',
    accessPoints: [{ name: 'Server Room Door', role: 'camera' }],
  },
  {
    ...camera,
    name: 'Loading Dock Camera',
    stream: 'warehouse',
    area: `${LOBBY}/Loading Dock`,
    covers: [`${LOBBY}/Loading Dock Geofence`],
    position: [1140, 250],
    coverage: { center: [1020, 170], radius: 140 },
    ip: '10.10.0.13',
    accessPoints: [{ name: 'Loading Dock Door', role: 'camera' }],
  },
  {
    // Meeting-room camera without a stream (never probed live): the history shows it overfilled once.
    ...camera,
    name: 'Meeting Room 12A Camera',
    area: `Nova Tower/${floorName(12)}/Suite 1201 (Aurora Analytics)/Meeting Room 12A`,
    ip: '10.10.12.31',
  },
  ...turnstiles.map((t, i): DeviceSpec => ({
    ...terminal,
    name: `Turnstile Terminal ${i + 1}`,
    area: `${LOBBY}/Turnstile Gallery`,
    position: [t.x, 465],
    ip: `10.10.0.${21 + i}`,
    configuration: faceMode,
    accessPoints: [{ name: t.name, role: 'terminal' }],
  })),
  {
    ...terminal,
    name: 'Reception Kiosk',
    area: `${LOBBY}/Reception`,
    position: [300, 610],
    ip: '10.10.0.31',
    configuration: { mode: 'visitor_check_in' },
    accessPoints: [{ name: 'Reception Desk', role: 'terminal' }],
  },
  {
    ...terminal,
    name: 'Server Room Reader',
    area: `${FLOOR3}/Server Room`,
    ip: '10.10.3.21',
    configuration: { mode: 'face_and_card', door_open_ms: 2000 },
    accessPoints: [{ name: 'Server Room Door', role: 'terminal' }],
  },
  {
    ...terminal,
    name: 'Executive Floor Reader',
    area: `${FLOOR24}/Executive Reception`,
    ip: '10.10.24.21',
    configuration: faceMode,
    accessPoints: [{ name: 'Executive Floor Door', role: 'terminal' }],
  },
  {
    ...terminal,
    name: 'Parking Gate Terminal',
    area: P1,
    position: [140, 620],
    ip: '10.10.90.21',
    configuration: { mode: 'face_and_plate', barrier_open_ms: 8000 },
    accessPoints: [{ name: 'Parking Gate', role: 'terminal' }],
  },
  {
    ...terminal,
    name: 'Loading Dock Reader',
    area: `${LOBBY}/Loading Dock`,
    position: [1060, 70],
    ip: '10.10.0.41',
    configuration: faceMode,
    accessPoints: [{ name: 'Loading Dock Door', role: 'terminal' }],
  },
  {
    ...sensor,
    name: 'Server Room Climate Sensor',
    area: `${FLOOR3}/Server Room`,
    ip: '10.10.3.31',
    configuration: { measures: ['temperature', 'humidity'] },
  },
  {
    ...sensor,
    name: 'Loading Dock Door Sensor',
    area: `${LOBBY}/Loading Dock`,
    position: [990, 70],
    ip: '10.10.0.42',
    configuration: { measures: ['door_contact'] },
    accessPoints: [{ name: 'Loading Dock Door', role: 'sensor' }],
  },
  {
    ...sensor,
    name: 'Parking Occupancy Sensor',
    area: P1,
    position: [600, 400],
    ip: '10.10.90.31',
    configuration: { measures: ['occupancy'] },
  },
];

const RIVERSIDE_FLOOR = 'Building A/Ground Floor';

const RIVERSIDE_ACCESS_POINTS: AccessPointSpec[] = [
  { name: 'Front Door', kind: 'door', area: `${RIVERSIDE_FLOOR}/Reception`, isEntryExit: true },
];

const RIVERSIDE_DEVICES: DeviceSpec[] = [
  {
    // No stream-server stream for Riverside: a camera without stream_url is not probed by the health check.
    ...camera,
    name: 'Front Door Camera',
    area: `${RIVERSIDE_FLOOR}/Reception`,
    ip: '10.20.0.11',
    accessPoints: [{ name: 'Front Door', role: 'camera' }],
  },
  {
    ...terminal,
    name: 'Front Door Terminal',
    area: `${RIVERSIDE_FLOOR}/Reception`,
    ip: '10.20.0.21',
    configuration: faceMode,
    accessPoints: [{ name: 'Front Door', role: 'terminal' }],
  },
];

export const SEED_ACCESS_POINTS: Record<OrgKey, AccessPointSpec[]> = { nova: NOVA_ACCESS_POINTS, riverside: RIVERSIDE_ACCESS_POINTS };
export const SEED_DEVICES: Record<OrgKey, DeviceSpec[]> = { nova: NOVA_DEVICES, riverside: RIVERSIDE_DEVICES };

/** Stream id of each camera video of the stream-server, by the video file name (`warehouse.mp4` -> `warehouse`). */
export const STREAM_IDS = ['entrance', 'lobby', 'serverroom', 'warehouse'] as const;

export function streamUrl(stream: string): string {
  return `rtsp://mediamtx:8554/${stream}`;
}

export function isCamera(spec: DeviceSpec): boolean {
  return spec.type === 'static_video_camera' || spec.type === 'ptz_camera' || spec.type === 'thermal_camera';
}
