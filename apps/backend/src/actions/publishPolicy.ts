import { z } from 'zod';
import { syncTerminals } from '../access/terminalSync.js';
import { ActionError, defineAction } from './types.js';

export type PublishResult = { device_id: string; result: string; epoch: number };

const FACILITY = `
  query PublishFacility($id: uuid!, $org: uuid!) {
    facilities(where: { id: { _eq: $id }, organization_id: { _eq: $org } }) { id }
  }
`;

const schema = z.object({ facility_id: z.string().uuid().nullish() });

/**
 * Action `publish_policy_to_terminals(facility_id?)` (org_admin): pushes the current policy payload to every access
 * terminal of the session organization (optionally one facility) now, through the same sync as the cron (stub
 * transport, real state); returns the per-terminal result and epoch.
 */
export const publishPolicyToTerminals = defineAction(schema, async (ctx): Promise<PublishResult[]> => {
  const organizationId = ctx.session.organizationId?.toLowerCase();
  if (!organizationId) throw new ActionError('no_organization', 'An organization session is required');
  const facilityId = ctx.input.facility_id?.toLowerCase();
  if (facilityId) {
    const { facilities } = await ctx.admin.request<{ facilities: { id: string }[] }>(FACILITY, {
      id: facilityId,
      org: organizationId,
    });
    if (facilities.length === 0) throw new ActionError('facility_not_found', 'Facility not found');
  }
  const reports = await syncTerminals(ctx.admin, { at: new Date(), force: true, organizationId, facilityId });
  return reports.map(({ device_id, result, epoch }) => ({ device_id, result, epoch }));
});
