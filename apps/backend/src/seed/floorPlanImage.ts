import sharp from 'sharp';
import type { Point } from './devicePlan.js';
import { PLAN_HEIGHT, PLAN_WIDTH, type AreaNode } from './facilityPlan.js';

/** What a generated floor plan shows: the area outlines with labels, plus access points and devices as markers. */
export type FloorPlanDrawing = {
  title: string;
  areas: AreaNode[];
  markers: { label: string; point: Point; kind: 'access_point' | 'camera' | 'device' }[];
};

const MARKER_COLOR = { access_point: '#d97706', camera: '#2563eb', device: '#059669' } as const;

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function areaSvg(node: AreaNode, outline: boolean): string {
  const label = escapeXml(node.name);
  if (node.circle) {
    const { center: [cx, cy], radius } = node.circle;
    return (
      `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#f59e0b" fill-opacity="0.08" stroke="#d97706" ` +
      `stroke-width="2" stroke-dasharray="10 6"/>` +
      `<text x="${cx}" y="${cy + radius - 12}" text-anchor="middle" font-size="14" fill="#92400e">${label}</text>`
    );
  }
  if (!node.rect) return '';
  const [x, y, w, h] = node.rect;
  if (outline) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="#1f2937" stroke-width="6"/>`;
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e5e7eb" fill-opacity="0.6" stroke="#4b5563" stroke-width="2"/>` +
    `<text x="${x + 10}" y="${y + h - 12}" font-size="16" font-weight="bold" fill="#111827">${label}</text>`
  );
}

function markerSvg(marker: FloorPlanDrawing['markers'][number]): string {
  const [x, y] = marker.point;
  const color = MARKER_COLOR[marker.kind];
  const shape =
    marker.kind === 'access_point'
      ? `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" fill="${color}"/>`
      : `<circle cx="${x}" cy="${y}" r="7" fill="${color}"/>`;
  // Terminals and sensors stay unlabelled (green dots) to keep the plan legible; labels near the right edge go to the left.
  if (marker.kind === 'device') return shape;
  const left = x > PLAN_WIDTH - 200;
  return (
    shape +
    `<text x="${left ? x - 10 : x + 10}" y="${y - 8}" text-anchor="${left ? 'end' : 'start'}" font-size="11" ` +
    `fill="${color}">${escapeXml(marker.label)}</text>`
  );
}

/** SVG of the plan; the first area is the floor outline (drawn bold, labelled by the title). */
export function floorPlanSvg(drawing: FloorPlanDrawing): string {
  const [outline, ...areas] = drawing.areas;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PLAN_WIDTH}" height="${PLAN_HEIGHT}" font-family="DejaVu Sans, Arial, sans-serif">`,
    `<rect width="${PLAN_WIDTH}" height="${PLAN_HEIGHT}" fill="#f8fafc"/>`,
    outline ? areaSvg(outline, true) : '',
    ...areas.map((a) => areaSvg(a, false)),
    ...drawing.markers.map(markerSvg),
    `<text x="${PLAN_WIDTH - 30}" y="${PLAN_HEIGHT - 26}" text-anchor="end" font-size="18" fill="#6b7280">${escapeXml(drawing.title)}</text>`,
    '</svg>',
  ].join('');
}

/** PNG rendering of the plan (PLAN_WIDTH x PLAN_HEIGHT). */
export async function renderFloorPlan(drawing: FloorPlanDrawing): Promise<Buffer> {
  return sharp(Buffer.from(floorPlanSvg(drawing))).png().toBuffer();
}
