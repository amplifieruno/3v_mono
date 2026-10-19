import type { ExtractedFace } from '../../face/insightFaceClient.js';

/** A face found in a sampled video frame (bbox in frame pixels). */
export type FrameFace = {
  video: string;
  /** Seconds from the start of the video. */
  time: number;
  frame: string;
  face: ExtractedFace;
  quality: number;
};

export type Cluster = { centroid: number[]; members: FrameFace[] };

/** Faces closer than this (cosine distance to the cluster centroid) are taken to be the same person. */
export const SAME_PERSON_DISTANCE = 0.4;

function normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0)) || 1;
  return values.map((v) => v / norm);
}

export function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return 1 - dot;
}

/**
 * Greedy clustering: faces in descending quality join the nearest cluster whose centroid is within
 * SAME_PERSON_DISTANCE, otherwise start a new one. Centroids are the normalized mean of the members.
 */
export function clusterFaces(faces: FrameFace[]): Cluster[] {
  const clusters: Cluster[] = [];
  const ordered = [...faces].sort((a, b) => b.quality - a.quality || a.video.localeCompare(b.video) || a.time - b.time);
  for (const item of ordered) {
    const embedding = normalize(item.face.embedding);
    let best: { cluster: Cluster; distance: number } | undefined;
    for (const cluster of clusters) {
      const distance = cosineDistance(cluster.centroid, embedding);
      if (distance < SAME_PERSON_DISTANCE && (!best || distance < best.distance)) best = { cluster, distance };
    }
    if (!best) {
      clusters.push({ centroid: embedding, members: [item] });
      continue;
    }
    best.cluster.members.push(item);
    best.cluster.centroid = centroidOf(best.cluster.members);
  }
  return clusters;
}

/** Up to `count` best members, at most one per frame, preferring frames far apart in time. */
export function pickRepresentatives(cluster: Cluster, count: number): FrameFace[] {
  const picked: FrameFace[] = [];
  const ordered = [...cluster.members].sort((a, b) => b.quality - a.quality);
  for (const minGap of [1.5, 0.5, 0]) {
    for (const member of ordered) {
      if (picked.length >= count) return picked;
      if (picked.includes(member)) continue;
      const tooClose = picked.some((p) => p.video === member.video && Math.abs(p.time - member.time) < minGap);
      const sameFrame = picked.some((p) => p.frame === member.frame);
      if (!tooClose && !sameFrame) picked.push(member);
    }
  }
  return picked;
}

function centroidOf(members: FrameFace[]): number[] {
  const sum = members.reduce<number[]>(
    (acc, m) => acc.map((v, k) => v + normalize(m.face.embedding)[k]),
    new Array<number>(members[0].face.embedding.length).fill(0),
  );
  return normalize(sum);
}

/** Joins clusters whose centroids are closer than `maxDistance` (one person split by the greedy pass), closest first. */
export function joinClusters(clusters: Cluster[], maxDistance: number): Cluster[] {
  const result = clusters.map((c) => ({ centroid: c.centroid, members: [...c.members] }));
  for (;;) {
    let pair: [number, number] | undefined;
    let best = maxDistance;
    for (let i = 0; i < result.length; i += 1) {
      for (let j = i + 1; j < result.length; j += 1) {
        const distance = cosineDistance(result[i].centroid, result[j].centroid);
        if (distance < best) {
          best = distance;
          pair = [i, j];
        }
      }
    }
    if (!pair) return result;
    const [i, j] = pair;
    const members = [...result[i].members, ...result[j].members];
    result[i] = { centroid: centroidOf(members), members };
    result.splice(j, 1);
  }
}

/**
 * Keeps, largest first, only clusters at least `minDistance` (the recognition threshold) from every cluster kept
 * before: seeded people must be distinguishable by the matcher, otherwise enrollment refuses the second one as a
 * duplicate and live matches would be ambiguous. Returns the kept and the dropped clusters.
 */
export function distinctClusters(clusters: Cluster[], minDistance: number): { kept: Cluster[]; dropped: Cluster[] } {
  const kept: Cluster[] = [];
  const dropped: Cluster[] = [];
  for (const cluster of [...clusters].sort((a, b) => b.members.length - a.members.length)) {
    if (kept.some((k) => cosineDistance(k.centroid, cluster.centroid) < minDistance)) dropped.push(cluster);
    else kept.push(cluster);
  }
  return { kept, dropped };
}

export type Role = 'employee' | 'vip' | 'blacklisted' | 'unknown';

/**
 * Roles of the video people (largest cluster first) and the crowd-photo people. Video people are the ones live
 * cameras will see: the best-covered is the VIP, the next the blacklisted person, the rest employees except the
 * smallest, who stays unknown when there are 4+. The last two crowd people (one when fewer than 4) are unknown;
 * other crowd people are employees.
 */
export function assignRoles(video: number, crowd: number): { video: Role[]; crowd: Role[] } {
  const videoRoles = Array.from({ length: video }, (_, i): Role => {
    if (i === 0) return 'vip';
    if (i === 1) return 'blacklisted';
    if (video >= 4 && i === video - 1) return 'unknown';
    return 'employee';
  });
  const unknown = crowd >= 4 ? 2 : Math.min(1, crowd);
  const crowdRoles = Array.from({ length: crowd }, (_, i): Role => (i >= crowd - unknown ? 'unknown' : 'employee'));
  return { video: videoRoles, crowd: crowdRoles };
}
