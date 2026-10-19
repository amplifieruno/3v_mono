import { describe, expect, it } from 'vitest';
import type { OrgKey } from './companies.js';
import { SEED_ACCESS_POINTS, SEED_DEVICES, STREAM_IDS, type Point } from './devicePlan.js';
import { flattenAreas, PLAN_HEIGHT, PLAN_WIDTH, SEED_FACILITIES, TEMPLATE_FLOOR, type AreaNode } from './facilityPlan.js';

const ORGS: OrgKey[] = ['nova', 'riverside'];

function inside([x, y]: Point): boolean {
  return x >= 0 && y >= 0 && x <= PLAN_WIDTH && y <= PLAN_HEIGHT;
}

/** Path key -> whether the area or one of its ancestors carries a floor plan. */
function planned(root: AreaNode): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const { key, parentKey, node } of flattenAreas(root)) {
    out.set(key, Boolean(node.plan) || (parentKey ? (out.get(parentKey) ?? false) : false));
  }
  return out;
}

describe('seed facility plan', () => {
  it('should model Nova Tower with about 60 areas, 3 floor plans and a geofence', () => {
    const areas = flattenAreas(SEED_FACILITIES.nova.root);
    // + 5 areas created from the office floor template on Floor 16.
    expect(areas.length + 5).toBeGreaterThanOrEqual(55);
    expect(areas.length + 5).toBeLessThanOrEqual(70);
    expect(areas.filter((a) => a.node.plan)).toHaveLength(3);
    expect(areas.some((a) => a.node.type === 'virtual_zone' && a.node.circle)).toBe(true);
    expect(areas.find((a) => a.key === `Nova Tower/${TEMPLATE_FLOOR}`)?.node.children).toBeUndefined();
    expect(new Set(areas.map((a) => a.key)).size).toBe(areas.length);
  });

  it('should name floors zero-padded so name order is floor order, with a single template floor', () => {
    const floors = SEED_FACILITIES.nova.root.children?.map((c) => c.name).filter((n) => n.startsWith('Floor ')) ?? [];
    expect(floors).toHaveLength(23);
    expect(floors[0]).toBe('Floor 02');
    expect(floors.at(-1)).toBe('Floor 24');
    expect(floors.every((n) => /^Floor \d\d$/.test(n))).toBe(true);
    expect([...floors].sort()).toEqual(floors);
  });

  it('should never give a child a lower access level than its parent', () => {
    const rank = { public: 0, restricted: 1, secure: 2, classified: 3 } as const;
    for (const org of ORGS) {
      for (const { key, node } of flattenAreas(SEED_FACILITIES[org].root)) {
        for (const child of node.children ?? []) {
          expect(rank[child.access ?? 'public'], `${key}/${child.name}`).toBeGreaterThanOrEqual(rank[node.access ?? 'public']);
        }
      }
    }
  });

  it('should model Riverside with 5 areas', () => {
    expect(flattenAreas(SEED_FACILITIES.riverside.root)).toHaveLength(5);
  });

  it('should keep every shape inside its floor plan and only on planned areas', () => {
    for (const org of ORGS) {
      const plan = planned(SEED_FACILITIES[org].root);
      for (const { key, node } of flattenAreas(SEED_FACILITIES[org].root)) {
        if (node.rect) {
          const [x, y, w, h] = node.rect;
          expect(plan.get(key), key).toBe(true);
          expect(inside([x, y]) && inside([x + w, y + h]), key).toBe(true);
        }
        if (node.circle) {
          const { center: [cx, cy], radius } = node.circle;
          expect(plan.get(key), key).toBe(true);
          expect(inside([cx - radius, cy - radius]) && inside([cx + radius, cy + radius]), key).toBe(true);
        }
      }
    }
  });

  it('should reference existing areas and place devices and access points inside their plans', () => {
    for (const org of ORGS) {
      const plan = planned(SEED_FACILITIES[org].root);
      const accessPoints = new Set(SEED_ACCESS_POINTS[org].map((a) => a.name));
      for (const ap of SEED_ACCESS_POINTS[org]) {
        expect(plan.has(ap.area), ap.area).toBe(true);
        if (ap.fromArea) expect(plan.has(ap.fromArea), ap.fromArea).toBe(true);
        if (ap.position) {
          expect(plan.get(ap.area), ap.name).toBe(true);
          expect(inside(ap.position), ap.name).toBe(true);
        }
      }
      for (const device of SEED_DEVICES[org]) {
        for (const area of [device.area, ...(device.covers ?? [])]) expect(plan.has(area), area).toBe(true);
        for (const binding of device.accessPoints ?? []) expect(accessPoints.has(binding.name), binding.name).toBe(true);
        if (device.position) {
          expect(plan.get(device.area), device.name).toBe(true);
          expect(inside(device.position), device.name).toBe(true);
        }
        if (device.coverage) {
          const { center: [cx, cy], radius } = device.coverage;
          expect(inside([cx - radius, cy - radius]) && inside([cx + radius, cy + radius]), device.name).toBe(true);
        }
      }
    }
  });

  it('should map the four stream-server streams to Nova cameras without credentials', () => {
    const streams = SEED_DEVICES.nova.filter((d) => d.stream).map((d) => d.stream);
    expect([...streams].sort()).toEqual([...STREAM_IDS]);
    expect(SEED_DEVICES.riverside.every((d) => !d.stream)).toBe(true);
    expect(SEED_DEVICES.riverside).toHaveLength(2);
    const names = SEED_DEVICES.nova.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
