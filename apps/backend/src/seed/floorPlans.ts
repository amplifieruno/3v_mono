import type { OrgKey } from './companies.js';
import { flattenAreas, PLAN_HEIGHT, PLAN_SCALE_M_PER_PX, PLAN_WIDTH, type FacilitySpec } from './facilityPlan.js';
import { renderFloorPlan, type FloorPlanDrawing } from './floorPlanImage.js';
import type { SeedContext } from './tenancy.js';

const PLANS = `
  query SeedFloorPlans($facility: uuid!) { floor_plans(where: { facility_id: { _eq: $facility } }) { area_id } }
`;
const INSERT_PLAN = `
  mutation SeedInsertFloorPlan($object: floor_plans_insert_input!) { insert_floor_plans_one(object: $object) { id } }
`;

type Target = { org: string; orgKey: OrgKey; facility: string; spec: FacilitySpec; areas: Map<string, string> };

/** The drawing of the plan at `planKey`: its area and the descendants with geometry. */
function drawing(target: Target, planKey: string, title: string): FloorPlanDrawing {
  const onPlan = (areaKey: string): boolean => areaKey === planKey || areaKey.startsWith(`${planKey}/`);
  const areas = flattenAreas(target.spec.root)
    .filter((a) => onPlan(a.key) && (a.node.rect || a.node.circle))
    .map((a) => a.node);
  return { title, areas };
}

/**
 * Floor plans of the planned areas that have none yet: a generated PNG (walls and title) uploaded to the
 * organization bucket (`metadata.kind = 'floor_plan'`), then the floor_plans row. A failed insert removes the upload.
 */
export async function seedFloorPlans(ctx: SeedContext, target: Target): Promise<void> {
  const { floor_plans: existing } = await ctx.admin.request<{ floor_plans: { area_id: string }[] }>(PLANS, {
    facility: target.facility,
  });
  const have = new Set(existing.map((p) => p.area_id));
  for (const { key, node } of flattenAreas(target.spec.root)) {
    if (!node.plan) continue;
    const areaId = target.areas.get(key);
    if (!areaId) throw new Error(`seed: area ${key} missing for its floor plan`);
    if (have.has(areaId)) continue;
    const png = await renderFloorPlan(drawing(target, key, `${target.spec.name} - ${node.plan.name}`));
    const slug = node.plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = await ctx.storage.upload({
      bucketId: target.org,
      name: `floor-plan-${slug}.png`,
      mimeType: 'image/png',
      data: png,
      metadata: { kind: 'floor_plan', area_id: areaId },
    });
    try {
      await ctx.admin.request(INSERT_PLAN, {
        object: {
          organization_id: target.org,
          facility_id: target.facility,
          area_id: areaId,
          name: node.plan.name,
          image_file_id: file.id,
          width_px: PLAN_WIDTH,
          height_px: PLAN_HEIGHT,
          scale_m_per_px: PLAN_SCALE_M_PER_PX,
          level: node.plan.level,
        },
      });
    } catch (error) {
      await ctx.storage.deleteFile(file.id).catch(() => undefined);
      throw error;
    }
  }
}
