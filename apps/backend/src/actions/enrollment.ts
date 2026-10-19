import { z } from 'zod';
import {
  addPhotosToIdentity,
  createIdentityFromImages,
  enrollForProfile,
  EnrollmentError,
  type EnrollmentDeps,
  type EnrollmentOutcome,
} from '../face/enrollmentService.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { loadOrganizationPhotos, PhotoNotFoundError, type PhotoSource } from '../face/photoSources.js';
import { createStorageClient } from '../storage/storageClient.js';
import { ActionError, defineAction, type ActionContext } from './types.js';

export type EnrollmentResult = {
  identity_id: string;
  identity_code: string;
  photos_added: number;
  templates: number;
  rejected: { file_id: string; reason: string }[];
};

/** Photos per request: processed sequentially on CPU InsightFace within the 120 s action timeout. */
export const MAX_PHOTOS = 10;

const fileIds = z
  .array(z.string().uuid())
  .min(1)
  .max(MAX_PHOTOS)
  .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]);

const enrollSchema = z.object({ profile_id: z.string().uuid(), file_ids: fileIds });
const createSchema = z.object({ file_ids: fileIds, attributes: z.record(z.unknown()).nullish() });
const addSchema = z.object({ identity_id: z.string().uuid(), file_ids: fileIds });

type Run = (deps: EnrollmentDeps, photos: PhotoSource[]) => Promise<EnrollmentOutcome>;

/** Shared wrapper: org session check, file ownership check, service call, error/result mapping. */
async function runEnrollment(ctx: ActionContext<unknown>, ids: string[], run: Run): Promise<EnrollmentResult> {
  const organizationId = ctx.session.organizationId?.toLowerCase();
  if (!organizationId) throw new ActionError('no_organization', 'An organization session is required');

  const storage = createStorageClient(ctx.env);
  const deps: EnrollmentDeps = {
    clients: { admin: ctx.admin, actor: ctx.actor },
    storage,
    insightFace: createInsightFaceClient(ctx.env.INSIGHTFACE_API_URL),
    organizationId,
  };
  try {
    const photos = await loadOrganizationPhotos(ctx.admin, storage, organizationId, ids);
    const outcome = await run(deps, photos);
    return {
      identity_id: outcome.identityId,
      identity_code: outcome.identityCode,
      photos_added: outcome.photosAdded,
      templates: outcome.templates,
      rejected: outcome.rejected.map((r) => ({ file_id: r.ref, reason: r.reason })),
    };
  } catch (error: unknown) {
    if (error instanceof PhotoNotFoundError) throw new ActionError('file_not_found', 'File not found');
    if (error instanceof EnrollmentError) throw new ActionError(error.code, error.message);
    throw error;
  }
}

/** enroll_face(profile_id, file_ids): see enrollForProfile. */
export const enrollFace = defineAction(enrollSchema, (ctx) =>
  runEnrollment(ctx, ctx.input.file_ids, (deps, photos) =>
    enrollForProfile(deps, { profileId: ctx.input.profile_id, photos }),
  ),
);

/** create_identity_from_photos(file_ids, attributes): see createIdentityFromImages. */
export const createIdentityFromPhotos = defineAction(createSchema, (ctx) =>
  runEnrollment(ctx, ctx.input.file_ids, (deps, photos) =>
    createIdentityFromImages(deps, { photos, attributes: ctx.input.attributes ?? undefined }),
  ),
);

/** add_identity_photos(identity_id, file_ids): see addPhotosToIdentity. */
export const addIdentityPhotos = defineAction(addSchema, (ctx) =>
  runEnrollment(ctx, ctx.input.file_ids, (deps, photos) =>
    addPhotosToIdentity(deps, { identityId: ctx.input.identity_id, photos }),
  ),
);
