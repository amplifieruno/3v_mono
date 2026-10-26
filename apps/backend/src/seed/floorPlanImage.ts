import sharp from 'sharp';
import { PLAN_HEIGHT, PLAN_WIDTH, type AreaNode } from './facilityPlan.js';

/**
 * What a generated floor plan shows: the walls of the floor and its rooms, and the title. The console draws the
 * areas' shapes, names and occupancy, the access points and the devices over it from the live rows (and places their
 * labels apart), so the drawing carries none of them: baked-in labels would sit under the console's markers and
 * labels, and go stale when a marker is moved.
 */
export type FloorPlanDrawing = {
  title: string;
  areas: AreaNode[];
};

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A room's walls; virtual zones (circles) are not walls and stay off the drawing. */
function areaSvg(node: AreaNode, outline: boolean): string {
  if (!node.rect) return '';
  const [x, y, w, h] = node.rect;
  if (outline) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff" stroke="#1f2937" stroke-width="6"/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e5e7eb" fill-opacity="0.6" stroke="#4b5563" stroke-width="2"/>`;
}

/** SVG of the plan; the first area is the floor outline (drawn bold, labelled by the title). */
export function floorPlanSvg(drawing: FloorPlanDrawing): string {
  const [outline, ...areas] = drawing.areas;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PLAN_WIDTH}" height="${PLAN_HEIGHT}" font-family="DejaVu Sans, Arial, sans-serif">`,
    `<rect width="${PLAN_WIDTH}" height="${PLAN_HEIGHT}" fill="#f8fafc"/>`,
    outline ? areaSvg(outline, true) : '',
    ...areas.map((a) => areaSvg(a, false)),
    `<text x="${PLAN_WIDTH - 30}" y="${PLAN_HEIGHT - 26}" text-anchor="end" font-size="18" fill="#6b7280">${escapeXml(drawing.title)}</text>`,
    '</svg>',
  ].join('');
}

/** PNG rendering of the plan (PLAN_WIDTH x PLAN_HEIGHT). */
export async function renderFloorPlan(drawing: FloorPlanDrawing): Promise<Buffer> {
  return sharp(Buffer.from(floorPlanSvg(drawing))).png().toBuffer();
}
