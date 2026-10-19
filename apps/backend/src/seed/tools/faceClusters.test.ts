import { describe, expect, it } from 'vitest';
import { assignRoles, clusterFaces, distinctClusters, joinClusters, pickRepresentatives, type FrameFace } from './faceClusters.js';

/** Unit vector in 4 dims rotated from axis `axis` towards the next axis by `angle` radians. */
function vec(axis: number, angle = 0): number[] {
  const v = [0, 0, 0, 0];
  v[axis] = Math.cos(angle);
  v[(axis + 1) % 4] += Math.sin(angle);
  return v;
}

function face(embedding: number[], time: number, quality = 0.8): FrameFace {
  return { video: 'v.mp4', time, frame: `f${time}`, quality, face: { bbox: [0, 0, 60, 60], score: 0.9, embedding } };
}

describe('clusterFaces', () => {
  it('should group faces of the same person and separate different people', () => {
    const clusters = clusterFaces([face(vec(0), 0), face(vec(0, 0.2), 1), face(vec(1), 2), face(vec(0, 0.1), 3)]);
    expect(clusters.map((c) => c.members.length).sort()).toEqual([1, 3]);
  });
});

describe('joinClusters and distinctClusters', () => {
  it('should join clusters closer than the join distance and drop ones the matcher would confuse', () => {
    // Cosine distance 1 - cos(angle): 0.6 rad ≈ 0.175, 0.9 rad ≈ 0.38.
    const a = { centroid: vec(0), members: [face(vec(0), 0), face(vec(0), 1)] };
    const b = { centroid: vec(0, 0.6), members: [face(vec(0, 0.6), 2)] };
    const c = { centroid: vec(2), members: [face(vec(2), 3)] };
    const joined = joinClusters([a, b, c], 0.3);
    expect(joined.map((x) => x.members.length).sort()).toEqual([1, 3]);

    const big = { centroid: vec(0), members: [face(vec(0), 0), face(vec(0), 1), face(vec(0), 2)] };
    const close = { centroid: vec(0, 0.9), members: [face(vec(0, 0.9), 3)] };
    const { kept, dropped } = distinctClusters([close, big, c], 0.5);
    expect(kept).toEqual([big, c]);
    expect(dropped).toEqual([close]);
  });
});

describe('pickRepresentatives', () => {
  it('should prefer the best faces spread over time, one per frame', () => {
    const members = [face(vec(0), 0, 0.9), face(vec(0), 0.3, 0.85), face(vec(0), 5, 0.7), face(vec(0), 9, 0.6)];
    const picked = pickRepresentatives({ centroid: vec(0), members }, 3);
    expect(picked.map((m) => m.time)).toEqual([0, 5, 9]);
  });
});

describe('assignRoles', () => {
  it('should make the best-covered video person the VIP, the next blacklisted and keep two crowd people unknown', () => {
    expect(assignRoles(3, 7)).toEqual({
      video: ['vip', 'blacklisted', 'employee'],
      crowd: ['employee', 'employee', 'employee', 'employee', 'employee', 'unknown', 'unknown'],
    });
    expect(assignRoles(5, 1).video).toEqual(['vip', 'blacklisted', 'employee', 'employee', 'unknown']);
    expect(assignRoles(5, 1).crowd).toEqual(['unknown']);
  });
});
