import { storeProfileDocument } from '../actions/profileDocuments.js';
import { fulfilDsr } from '../dsr/fulfil.js';
import { enrollForProfile, type EnrollmentDeps } from '../face/enrollmentService.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { photoFromBuffer } from '../face/photoSources.js';
import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import { blendedFaces } from './authSynthetic.js';
import { DEDICATED_SUBJECTS, DSRS, type DsrSpec } from './complianceFlowsPlan.js';
import { waitFor } from './complianceIntegrations.js';
import { renderPdf } from './pdf.js';
import type { SeedPeopleResult } from './people.js';
import type { SeedContext } from './tenancy.js';

/**
 * Data subject requests of Nova Tower (slice 10) through the real fulfil_dsr job (dsr/fulfil.ts): each request is
 * filed with the Nova Tower admin's org_admin session (requested_by stamped, received_at in the past), then the job
 * runs in-process (the live fulfil_dsr trigger may claim it first: the claim decides, the seed waits for the result):
 * access -> bundle zip (kind dsr_export) and completed; restriction -> the profile restricted, completed; erasure ->
 * restriction, erasure, storage drain, completed; rectification -> waiting for org_admin. The overdue rectification
 * (filed 34 days ago) gets its dsr_overdue event from itap.dsr_overdue_events right away (the dsr_maintenance cron
 * would emit it within 10 minutes). Runs after the history replay and every other step, so neither the replay nor the
 * analytics see a restricted or erased person.
 *
 * The erasure and restriction subjects are dedicated people (external_id `compliance:*`, never `seed:*`, so the
 * people / history steps ignore them) with a granted biometric consent and a face enrolled through the real
 * enrollment (a blend of two seed crops: a person who does not exist); the erasure subject also has a contract PDF.
 * Idempotent: nothing happens once the organization has a request.
 */
export type SeedDsrResult = { requests: number; statuses: string[] };

const DAY_MS = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString();

const COUNT = `query SeedDsrCount($org: uuid!) { data_subject_requests_aggregate(where: { organization_id: { _eq: $org } }) { aggregate { count } } }`;
const SUBJECT = `
  query SeedDsrSubject($org: uuid!, $ext: String!) {
    profiles(where: { organization_id: { _eq: $org }, external_id: { _eq: $ext } }) { id identities_count profile_documents { title } }
  }
`;
const INSERT_SUBJECT = `mutation SeedDsrSubjectInsert($object: profiles_insert_input!) { insert_profiles_one(object: $object) { id } }`;
const INSERT_REQUEST = `
  mutation SeedDsr($object: data_subject_requests_insert_input!) { insert_data_subject_requests_one(object: $object) { id } }
`;
const REQUEST = `
  query SeedDsrState($id: uuid!) { data_subject_requests_by_pk(id: $id) { status attempts lease_expires_at last_error partial } }
`;
const OVERDUE = `mutation SeedDsrOverdue($at: timestamptz!) { dsr_overdue_events(args: { p_at: $at }) { id } }`;

type RequestState = { status: string; attempts: number; lease_expires_at: string | null; last_error: string | null; partial: boolean };

/** The dedicated subject's profile (created with a granted biometric consent when missing), face and document. */
async function dedicatedSubject(ctx: SeedContext, deps: EnrollmentDeps, actor: HasuraClient, key: 'erasure' | 'restriction'): Promise<string> {
  const spec = DEDICATED_SUBJECTS[key];
  const org = deps.organizationId;
  type Row = { id: string; identities_count: number; profile_documents: { title: string }[] };
  let row = (await ctx.admin.request<{ profiles: Row[] }>(SUBJECT, { org, ext: spec.externalId })).profiles[0];
  if (!row) {
    const grantedAt = iso(ctx.now.getTime() - 60 * DAY_MS);
    const { insert_profiles_one: inserted } = await ctx.admin.request<{ insert_profiles_one: { id: string } }>(INSERT_SUBJECT, {
      object: {
        ...spec.profile,
        organization_id: org,
        external_id: spec.externalId,
        consent_records: { data: [{ purpose: 'biometric_processing', status: 'granted', method: 'electronic', granted_at: grantedAt }] },
      },
    });
    row = { id: inserted.id, identities_count: 0, profile_documents: [] };
  }
  if (row.identities_count === 0) {
    const images = await blendedFaces(spec.faces[0], spec.faces[1]);
    await enrollForProfile(deps, {
      profileId: row.id,
      photos: images.map((image, i) => photoFromBuffer(`${spec.externalId}/${i === 0 ? 'front' : 'mirror'}.jpg`, image)),
    });
  }
  const doc = spec.document;
  if (doc && !row.profile_documents.some((d) => d.title === doc.title)) {
    const name = `${spec.profile.first_name} ${spec.profile.last_name}`;
    await storeProfileDocument(
      { storage: ctx.storage, actor },
      {
        organizationId: org,
        profileId: row.id,
        kind: doc.kind,
        title: doc.title,
        fileName: `${doc.kind}-${spec.profile.last_name.toLowerCase()}.pdf`,
        mimeType: 'application/pdf',
        data: renderPdf([doc.title, name, 'Fit-out works, Floor 12', 'Demo document generated by the ITAP seed.']),
      },
    );
  }
  return row.id;
}

/** Files the request as the owner and runs the job until it completes (rectification: until it waits). */
async function fileRequest(ctx: SeedContext, owner: HasuraClient, spec: DsrSpec, profileId: string): Promise<string> {
  const { insert_data_subject_requests_one: r } = await owner.request<{ insert_data_subject_requests_one: { id: string } }>(INSERT_REQUEST, {
    object: {
      profile_id: profileId,
      request_type: spec.type,
      received_at: iso(ctx.now.getTime() - spec.daysAgo * DAY_MS),
      notes: spec.notes,
      details: spec.details ?? {},
    },
  });
  await fulfilDsr(r.id, { admin: ctx.admin, storage: ctx.storage });
  const waiting = (s: RequestState) => spec.type === 'rectification' && s.status === 'in_progress' && s.attempts > 0 && s.lease_expires_at === null;
  const state = await waitFor(
    async () => (await ctx.admin.request<{ data_subject_requests_by_pk: RequestState | null }>(REQUEST, { id: r.id })).data_subject_requests_by_pk,
    (s) => s !== null && (s.status === 'completed' || s.status === 'rejected' || waiting(s) || s.last_error !== null),
    300_000,
    `${spec.type} request`,
  );
  if (!state || state.last_error !== null || state.status === 'rejected') {
    throw new Error(`seed: ${spec.key} request ended ${state?.status ?? 'missing'} (${state?.last_error ?? 'no error'})`);
  }
  return state.partial ? 'completed (partial)' : state.status;
}

export async function seedDsrs(
  ctx: SeedContext,
  args: { org: string; owner: HasuraClient; adminUser: string; people: SeedPeopleResult },
): Promise<SeedDsrResult> {
  const { org } = args;
  const count = await ctx.admin.request<{ data_subject_requests_aggregate: { aggregate: { count: number } } }>(COUNT, { org });
  if (count.data_subject_requests_aggregate.aggregate.count > 0) return { requests: 0, statuses: [] };
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: args.adminUser, organizationId: org });
  const deps: EnrollmentDeps = {
    clients: { admin: ctx.admin, actor },
    storage: ctx.storage,
    insightFace: createInsightFaceClient(ctx.env.INSIGHTFACE_API_URL),
    organizationId: org,
  };
  const dedicated = {
    erasure: await dedicatedSubject(ctx, deps, actor, 'erasure'),
    restriction: await dedicatedSubject(ctx, deps, actor, 'restriction'),
  };
  const statuses: string[] = [];
  for (const spec of DSRS) {
    const s = spec.subject;
    const profileId = 'dedicated' in s ? dedicated[s.dedicated] : args.people.byRole[s.role][s.index];
    if (!profileId) throw new Error(`seed: no subject for the ${spec.key} request`);
    statuses.push(await fileRequest(ctx, args.owner, spec, profileId));
  }
  await ctx.admin.request(OVERDUE, { at: ctx.now.toISOString() });
  return { requests: DSRS.length, statuses };
}
