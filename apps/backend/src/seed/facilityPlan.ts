import type { OrgKey } from './companies.js';

/**
 * Seed layout of the facilities. An area is keyed by its path of names from the root ("Nova Tower/Lobby/Reception");
 * a node with `plan` carries a floor plan, and the `rect` / `circle` shapes of it and its descendants are in that plan's
 * pixel space (every plan is PLAN_WIDTH x PLAN_HEIGHT).
 */
export type Rect = [x: number, y: number, width: number, height: number];

export type AreaNode = {
  name: string;
  type: string;
  access?: 'public' | 'restricted' | 'secure' | 'classified';
  capacity?: number;
  /** Loitering threshold (areas.loitering_threshold_seconds): dwell events of evaluate_dwell_rules. */
  loitering?: number;
  description?: string;
  rect?: Rect;
  circle?: { center: [number, number]; radius: number };
  plan?: { name: string; level: number };
  children?: AreaNode[];
};

export type FacilitySpec = {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  timezone: string;
  operatingHours: { days: number[]; from: string; to: string }[];
  contact: Record<string, string>;
  root: AreaNode;
};

export const PLAN_WIDTH = 1200;
export const PLAN_HEIGHT = 800;
/** 1 px = 5 cm: a plan covers 60 m x 40 m. */
export const PLAN_SCALE_M_PER_PX = 0.05;
const OUTLINE: Rect = [20, 20, 1160, 760];

const WEEKDAYS = [1, 2, 3, 4, 5];

/** Tenant suites of floors without a detailed layout (suite number = floor + unit, see SEED_COMPANIES). */
const TENANT_SUITES: Record<number, { suite: string; company: string }> = {
  6: { suite: '0602', company: 'Granite Logistics' },
  8: { suite: '0808', company: 'Juniper Media Group' },
  9: { suite: '0904', company: 'Driftwood Design Studio' },
  11: { suite: '1105', company: 'Evergreen Health Partners' },
  14: { suite: '1407', company: 'Fennel & Co Consulting' },
  15: { suite: '1510', company: 'Helix Biotech' },
  18: { suite: '1802', company: 'Cobalt Legal LLP' },
  20: { suite: '2003', company: 'Ionic Software' },
  22: { suite: '2201', company: 'Bluefin Capital' },
};

/** Floor 16 is left empty: the seed fills it by applying the "Standard office floor" template. */
export const TEMPLATE_FLOOR = floorName(16);

const LOBBY: AreaNode = {
  name: 'Lobby',
  type: 'floor',
  capacity: 300,
  description: 'Ground floor: entrance, turnstiles, reception and the loading dock',
  rect: OUTLINE,
  plan: { name: 'Lobby (ground floor)', level: 0 },
  children: [
    { name: 'Main Entrance', type: 'entrance', capacity: 80, rect: [480, 680, 240, 100] },
    { name: 'Reception', type: 'zone', capacity: 30, rect: [60, 460, 320, 220] },
    // Floors have no camera: arrivals stay in the gallery's occupancy until their session closes (up to ~95 in the
    // morning rush, dates vary with the run day); 120 keeps occupancy_exceeded to the planned Meeting Room 12A case.
    { name: 'Turnstile Gallery', type: 'zone', capacity: 120, rect: [440, 440, 320, 200] },
    { name: 'Lobby Lounge', type: 'zone', capacity: 60, loitering: 1200, rect: [800, 460, 340, 240] },
    { name: 'Elevator Hall', type: 'corridor', access: 'restricted', capacity: 80, rect: [400, 80, 400, 300] },
    { name: 'Loading Dock', type: 'zone', access: 'restricted', capacity: 15, loitering: 600, rect: [880, 60, 280, 220] },
    {
      name: 'Loading Dock Geofence',
      type: 'virtual_zone',
      access: 'restricted',
      description: 'Geofence around the loading dock door (after-hours presence alerts)',
      // Around the dock door on the north wall, not centred on the dock, so the two shapes stay apart on the plan.
      circle: { center: [1020, 120], radius: 100 },
    },
  ],
};

const FLOOR_12: AreaNode = {
  name: 'Floor 12',
  type: 'floor',
  rect: OUTLINE,
  plan: { name: 'Floor 12', level: 12 },
  children: [
    { name: 'Elevator Lobby 12', type: 'corridor', capacity: 30, rect: [500, 300, 200, 200] },
    {
      name: 'Suite 1201 (Aurora Analytics)',
      type: 'zone',
      access: 'restricted',
      capacity: 90,
      rect: [40, 40, 440, 720],
      children: [
        { name: 'Open Office 1201', type: 'room', access: 'restricted', capacity: 70, rect: [60, 60, 400, 400] },
        { name: 'Meeting Room 12A', type: 'room', access: 'restricted', capacity: 12, rect: [60, 480, 190, 240] },
        { name: 'Kitchen 12', type: 'room', access: 'restricted', capacity: 15, rect: [270, 480, 190, 240] },
      ],
    },
    { name: 'Suite 1205 (available)', type: 'zone', access: 'restricted', capacity: 90, rect: [720, 40, 440, 720] },
  ],
};

/** Zero-padded, so ordering by name is the natural floor order ("Floor 02" ... "Floor 24"). */
export function floorName(n: number): string {
  return `Floor ${String(n).padStart(2, '0')}`;
}

function floor(n: number): AreaNode {
  if (n === 12) return FLOOR_12;
  const name = floorName(n);
  if (n === 2) {
    return {
      name,
      type: 'floor',
      description: 'Shared conference centre',
      children: [
        { name: 'Conference Hall', type: 'room', capacity: 200 },
        { name: 'Training Room', type: 'room', capacity: 40 },
      ],
    };
  }
  if (n === 3) {
    return {
      name,
      type: 'floor',
      access: 'restricted',
      description: 'Technical floor',
      children: [
        { name: 'Server Room', type: 'room', access: 'secure', capacity: 6, description: 'Main data hall' },
        { name: 'Network Operations Center', type: 'room', access: 'restricted', capacity: 10 },
      ],
    };
  }
  if (n === 24) {
    return {
      name,
      type: 'floor',
      access: 'restricted',
      description: 'Executive floor',
      children: [
        { name: 'Executive Reception', type: 'zone', access: 'restricted', capacity: 15 },
        { name: 'Executive Offices', type: 'zone', access: 'restricted', capacity: 25 },
        { name: 'Boardroom', type: 'room', access: 'secure', capacity: 20 },
      ],
    };
  }
  const tenant = TENANT_SUITES[n];
  if (!tenant) return { name, type: 'floor' };
  return {
    name,
    type: 'floor',
    children: [{ name: `Suite ${tenant.suite} (${tenant.company})`, type: 'zone', access: 'restricted', capacity: 120 }],
  };
}

const PARKING: AreaNode = {
  name: 'Parking',
  type: 'parking',
  capacity: 420,
  description: 'Underground parking, levels P-1 and P-2',
  children: [
    {
      name: 'Parking Level P-1',
      type: 'parking',
      capacity: 200,
      rect: OUTLINE,
      plan: { name: 'Parking level P-1', level: -1 },
      children: [
        { name: 'Entrance Ramp', type: 'entrance', rect: [40, 600, 260, 160] },
        { name: 'EV Charging Zone', type: 'zone', capacity: 24, rect: [860, 60, 300, 200] },
        { name: 'Row A', type: 'sector', capacity: 60, rect: [360, 120, 440, 160] },
        { name: 'Row B', type: 'sector', capacity: 60, rect: [360, 480, 440, 160] },
      ],
    },
    { name: 'Parking Level P-2', type: 'parking', capacity: 220 },
  ],
};

const NOVA_TOWER: FacilitySpec = {
  name: 'Nova Tower',
  description: '24-floor business centre with two underground parking levels',
  address: '1 Nova Avenue, Moscow',
  latitude: 55.7496,
  longitude: 37.5372,
  timezone: 'Europe/Moscow',
  operatingHours: [
    { days: WEEKDAYS, from: '07:00', to: '21:00' },
    { days: [6], from: '09:00', to: '15:00' },
  ],
  contact: { phone: '+7 495 000-00-24', email: 'facility@nova-tower.example', person: 'Building operations desk' },
  root: {
    name: 'Nova Tower',
    type: 'building',
    capacity: 3200,
    children: [LOBBY, ...Array.from({ length: 23 }, (_, i) => floor(i + 2)), PARKING],
  },
};

const RIVERSIDE_A: FacilitySpec = {
  name: 'Riverside Building A',
  description: 'Two-storey office building on the river side of the park',
  address: '7 Riverside Drive, Moscow',
  latitude: 55.7012,
  longitude: 37.6489,
  timezone: 'Europe/Moscow',
  operatingHours: [{ days: WEEKDAYS, from: '08:00', to: '20:00' }],
  contact: { phone: '+7 495 000-00-07', email: 'office@riverside-park.example' },
  root: {
    name: 'Building A',
    type: 'building',
    capacity: 250,
    children: [
      {
        name: 'Ground Floor',
        type: 'floor',
        children: [
          { name: 'Reception', type: 'zone', capacity: 20 },
          { name: 'Office Wing', type: 'zone', access: 'restricted', capacity: 150 },
          { name: 'Server Closet', type: 'room', access: 'secure', capacity: 2 },
        ],
      },
    ],
  },
};

export const SEED_FACILITIES: Record<OrgKey, FacilitySpec> = { nova: NOVA_TOWER, riverside: RIVERSIDE_A };

/** Template structure: an array of root nodes (itap.valid_template_structure). */
export const OFFICE_FLOOR_TEMPLATE = {
  name: 'Standard office floor',
  description: 'Elevator lobby, open office with focus booths, meeting room and kitchen',
  structure: [
    { name: 'Elevator Lobby', area_type: 'corridor', capacity: 30 },
    {
      name: 'Open Office',
      area_type: 'zone',
      access_level: 'restricted',
      capacity: 120,
      children: [{ name: 'Focus Booths', area_type: 'room', access_level: 'restricted', capacity: 8 }],
    },
    { name: 'Meeting Room', area_type: 'room', access_level: 'restricted', capacity: 12 },
    { name: 'Kitchen', area_type: 'room', access_level: 'restricted', capacity: 20 },
  ],
};

/** Polygon shape of a rectangle (closed ring) or the circle of a node; null when the node has no geometry. */
export function nodeShape(node: AreaNode): Record<string, unknown> | null {
  if (node.circle) return { type: 'Circle', center: node.circle.center, radius: node.circle.radius };
  if (!node.rect) return null;
  const [x, y, w, h] = node.rect;
  return { type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] };
}

/** Every node with its path key and parent key, parents first. */
export function flattenAreas(root: AreaNode): { key: string; parentKey: string | null; node: AreaNode }[] {
  const out: { key: string; parentKey: string | null; node: AreaNode }[] = [];
  const walk = (node: AreaNode, parentKey: string | null): void => {
    const key = parentKey ? `${parentKey}/${node.name}` : node.name;
    out.push({ key, parentKey, node });
    for (const child of node.children ?? []) walk(child, key);
  };
  walk(root, null);
  return out;
}
