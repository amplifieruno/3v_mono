import { createHasuraClient } from '../hasura/client.js';
import { seedComplianceConfig, type ComplianceConfigResult } from './complianceConfig.js';
import { seedDsrs, type SeedDsrResult } from './complianceDsr.js';
import { seedExports, type SeedExportsResult } from './complianceExports.js';
import { seedIntegrations, type SeedIntegrationsResult } from './complianceIntegrations.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import type { SeedPeopleResult } from './people.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Compliance of the seed (slice 10), the last step (after the history replay, the analytics and face auth): Nova Tower
 * only (Riverside keeps no policy: no policy = keep).
 * 1. configuration: retention policies (>= 31 days, one facility-specific), processing activities with DPIA PDFs,
 *    legal holds on an incident and a profile, past retention runs (complianceConfig);
 * 2. integrations: HR with fixtures and sync history, SIEM ok, BMS failing (complianceIntegrations);
 * 3. exports: definitions and jobs with files by the real runner as the Nova Tower admin (complianceExports) — before
 *    the requests, so no export names the erasure subject;
 * 4. data subject requests through the real fulfil_dsr job (complianceDsr) — last: the restriction and the erasure
 *    happen after everything that processes people.
 */
export type SeedComplianceResult = {
  config: ComplianceConfigResult;
  integrations: SeedIntegrationsResult;
  exports: SeedExportsResult;
  dsrs: SeedDsrResult;
  durationMs: number;
};

export async function seedCompliance(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facilities: SeedFacilitiesResult,
  people: SeedPeopleResult,
): Promise<SeedComplianceResult> {
  const started = Date.now();
  const org = tenancy.orgs.nova;
  const ownerId = tenancy.users.novaAdmin;
  const owner = createHasuraClient(ctx.env, { role: 'org_admin', userId: ownerId, organizationId: org });
  const { timezone } = SEED_FACILITIES.nova;
  const config = await seedComplianceConfig(ctx, { org, owner, ownerId, facility: facilities.facilities.nova });
  const integrations = await seedIntegrations(ctx, { org, owner, ownerId, timezone });
  const exports = await seedExports(ctx, { org, owner, timezone });
  const dsrs = await seedDsrs(ctx, { org, owner, adminUser: tenancy.users.admin, people });
  return { config, integrations, exports, dsrs, durationMs: Date.now() - started };
}
