import { createHasuraClient } from '../hasura/client.js';
import type { OrgKey } from './companies.js';
import { flattenAreas, nodeShape, OFFICE_FLOOR_TEMPLATE, SEED_FACILITIES, TEMPLATE_FLOOR, type FacilitySpec } from './facilityPlan.js';
import { seedFloorPlans } from './floorPlans.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

export type SeedFacilitiesResult = {
  /** Facility ids by org. */
  facilities: Record<OrgKey, string>;
  /** Area ids keyed `<org>/<area path>` (path of names from the root, e.g. `nova/Nova Tower/Lobby`). */
  areas: Record<string, string>;
};

type AreaRow = { id: string; name: string; parent_id: string | null };

const FACILITY = `
  query SeedFacility($org: uuid!, $name: String!) {
    facilities(where: { organization_id: { _eq: $org }, name: { _eq: $name } }) { id }
  }
`;
const INSERT_FACILITY = `
  mutation SeedInsertFacility($object: facilities_insert_input!) { insert_facilities_one(object: $object) { id } }
`;
const AREAS = `
  query SeedAreas($facility: uuid!) { areas(where: { facility_id: { _eq: $facility } }) { id name parent_id } }
`;
const INSERT_AREAS = `
  mutation SeedInsertAreas($objects: [areas_insert_input!]!) { insert_areas(objects: $objects) { affected_rows } }
`;
const UPSERT_TEMPLATE = `
  mutation SeedTemplate($object: facility_templates_insert_input!) {
    insert_facility_templates_one(
      object: $object
      on_conflict: { constraint: facility_templates_organization_id_name_key, update_columns: [] }
    ) { id }
  }
`;
const TEMPLATE = `
  query SeedTemplateId($org: uuid!, $name: String!) {
    facility_templates(where: { organization_id: { _eq: $org }, name: { _eq: $name } }) { id }
  }
`;
const APPLY_TEMPLATE = `
  mutation SeedApplyTemplate($template: uuid!, $facility: uuid!, $parent: uuid!) {
    apply_facility_template(args: { p_template: $template, p_facility: $facility, p_parent_area: $parent }) { id }
  }
`;

async function upsertFacility(ctx: SeedContext, org: string, spec: FacilitySpec): Promise<string> {
  const found = await ctx.admin.request<{ facilities: { id: string }[] }>(FACILITY, { org, name: spec.name });
  if (found.facilities[0]) return found.facilities[0].id;
  const { insert_facilities_one: row } = await ctx.admin.request<{ insert_facilities_one: { id: string } }>(INSERT_FACILITY, {
    object: {
      organization_id: org,
      name: spec.name,
      description: spec.description,
      address: spec.address,
      latitude: spec.latitude,
      longitude: spec.longitude,
      timezone: spec.timezone,
      operating_hours: spec.operatingHours,
      contact: spec.contact,
    },
  });
  return row.id;
}

/** Path key -> id of every area of the facility (keys built from names; siblings with equal names keep the first). */
async function areaKeys(ctx: SeedContext, facility: string): Promise<Map<string, string>> {
  const { areas } = await ctx.admin.request<{ areas: AreaRow[] }>(AREAS, { facility });
  const byId = new Map(areas.map((a) => [a.id, a]));
  const keyOf = (area: AreaRow): string => {
    const parent = area.parent_id ? byId.get(area.parent_id) : undefined;
    return parent ? `${keyOf(parent)}/${area.name}` : area.name;
  };
  const keys = new Map<string, string>();
  for (const area of [...areas].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = keyOf(area);
    if (!keys.has(key)) keys.set(key, area.id);
  }
  return keys;
}

/** Inserts the planned areas that are missing, one tree level per mutation (parents exist before their children). */
async function seedAreas(ctx: SeedContext, org: string, facility: string, spec: FacilitySpec): Promise<Map<string, string>> {
  const planned = flattenAreas(spec.root);
  let keys = await areaKeys(ctx, facility);
  const maxDepth = Math.max(...planned.map((p) => p.key.split('/').length));
  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const missing = planned.filter((p) => p.key.split('/').length === depth && !keys.has(p.key));
    if (missing.length === 0) continue;
    await ctx.admin.request(INSERT_AREAS, {
      objects: missing.map(({ parentKey, node }) => {
        const parent = parentKey ? keys.get(parentKey) : null;
        if (parentKey && !parent) throw new Error(`seed: parent area ${parentKey} missing`);
        return {
          organization_id: org,
          facility_id: facility,
          parent_id: parent,
          name: node.name,
          description: node.description ?? null,
          area_type: node.type,
          access_level: node.access ?? 'public',
          capacity: node.capacity ?? null,
          shape: nodeShape(node),
        };
      }),
    });
    keys = await areaKeys(ctx, facility);
  }
  return keys;
}

/** The "Standard office floor" template, applied once to the empty template floor of Nova Tower. */
async function seedTemplate(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facility: string,
  keys: Map<string, string>,
): Promise<boolean> {
  const org = tenancy.orgs.nova;
  await ctx.admin.request(UPSERT_TEMPLATE, { object: { ...OFFICE_FLOOR_TEMPLATE, organization_id: org } });
  const floorKey = `${SEED_FACILITIES.nova.root.name}/${TEMPLATE_FLOOR}`;
  const floor = keys.get(floorKey);
  if (!floor) throw new Error(`seed: ${floorKey} missing`);
  if ([...keys.keys()].some((k) => k.startsWith(`${floorKey}/`))) return false;
  const { facility_templates: templates } = await ctx.admin.request<{ facility_templates: { id: string }[] }>(TEMPLATE, {
    org,
    name: OFFICE_FLOOR_TEMPLATE.name,
  });
  const template = templates[0]?.id;
  if (!template) throw new Error('seed: facility template missing');
  // Same code path as the admin UI: the org_admin mutation, run in the seed admin's session of the organization.
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: tenancy.users.admin, organizationId: org });
  await actor.request(APPLY_TEMPLATE, { template, facility, parent: floor });
  return true;
}

/** Facilities, area trees, the office floor template and the floor plans of both organizations (idempotent by name). */
export async function seedFacilities(ctx: SeedContext, tenancy: SeedTenancyResult): Promise<SeedFacilitiesResult> {
  const result: SeedFacilitiesResult = { facilities: { nova: '', riverside: '' }, areas: {} };
  for (const key of Object.keys(SEED_FACILITIES) as OrgKey[]) {
    const org = tenancy.orgs[key];
    const spec = SEED_FACILITIES[key];
    const facility = await upsertFacility(ctx, org, spec);
    let keys = await seedAreas(ctx, org, facility, spec);
    if (key === 'nova' && (await seedTemplate(ctx, tenancy, facility, keys))) keys = await areaKeys(ctx, facility);
    await seedFloorPlans(ctx, { org, orgKey: key, facility, spec, areas: keys });
    result.facilities[key] = facility;
    for (const [path, id] of keys) result.areas[`${key}/${path}`] = id;
  }
  return result;
}
