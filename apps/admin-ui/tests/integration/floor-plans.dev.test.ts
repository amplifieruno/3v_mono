import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { createItapHasuraProvider } from '../../src/data/provider';
import { validateShape } from '../../src/fields/plan-shape-check';
import {
  areaChain,
  floorPlanOf,
  planAreaOf,
  planOfChain,
  rowsOf,
} from '../../src/fields/plan-rows';
import { presignStorageFile, uploadStorageFile } from '../../src/fields/storage-client';
import {
  ADMIN_EMAIL,
  DEV_GRAPHQL,
  DEV_STACK_ENABLED,
  DEV_STORAGE,
  NOVA_NAME,
  signInDev,
} from '../support/dev-stack';
import {
  AREA_RESOURCE,
  FACILITY_RESOURCE,
  FLOOR_PLAN_RESOURCE,
} from '../../src/data/resource-names';
import { offsetPage } from '../support/pagination';

/**
 * A floor plan round trip against the dev stack (Nova Tower, `org_admin`), on a facility
 * created for the test: the console's storage client uploads a PNG into the organization's
 * bucket as kind `floor_plan`, the plan row takes it, a room inside the floor saves a drawn
 * polygon, a circle and a cleared shape, and the database refuses what the console refuses
 * (a ring of 2 points). The room resolves the floor's plan the way the shape input does.
 * Everything created is deleted (the plan goes with its floor); the uploaded file stays in the
 * bucket, as `org_admin` cannot delete storage files.
 */

/** A 1x1 transparent PNG: hasura-storage detects the type from the bytes. */
const PNG_1X1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'floor-plans-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

function context(): MutationContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
    idempotencyKey: crypto.randomUUID(),
  };
}

const facilityScope = (facility: string) => ({
  narrowed: true,
  dimensions: { facility: { field: 'facility_id', values: [facility], empty: 'unset' } },
});

describe.skipIf(!DEV_STACK_ENABLED)('floor plans against the dev stack (Nova Tower)', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;
  const stamp = Date.now();
  let facilityId = '';
  const created: string[] = [];

  const mutate = (resource: string, input: Record<string, unknown>) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({
        ...IDENTITY,
        ref: { namespace: 'default', id: resource },
        resource,
        idField: 'id',
        ...input,
      } as never) as never,
      context(),
    ) as Promise<{ record: Record<string, unknown> }>;

  const list = async (resource: string) => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: { namespace: 'default', id: resource },
        resource,
        pagination: offsetPage(1, 100),
        readScope: facilityScope(facilityId),
      } as never) as never,
      context(),
    )) as { data: readonly Record<string, unknown>[] };
    return data;
  };

  const createArea = async (input: Record<string, unknown>) => {
    const { record } = await mutate(AREA_RESOURCE, {
      kind: 'createOne',
      input: { facility_id: facilityId, area_type: 'zone', ...input },
    });
    created.push(String(record.id));
    return record;
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const { record } = await mutate(FACILITY_RESOURCE, {
      kind: 'createOne',
      input: { name: `dev-test floor plans ${stamp}`, timezone: 'UTC' },
    });
    facilityId = String(record.id);
  });

  afterAll(async () => {
    for (const id of [...created].reverse()) await mutate(AREA_RESOURCE, { kind: 'deleteOne', id });
    if (facilityId) await mutate(FACILITY_RESOURCE, { kind: 'deleteOne', id: facilityId });
  });

  it('uploads a plan image, saves the plan and the shapes drawn on it', async () => {
    const floor = await createArea({ name: `Floor ${stamp}`, area_type: 'floor' });
    const room = await createArea({
      name: `Room ${stamp}`,
      parent_id: floor.id,
      area_type: 'room',
    });

    const identity = await auth.getIdentity({} as never);
    const target = { base: DEV_STORAGE, getToken: () => auth.getToken() };
    const file = new File([PNG_1X1], `floor-plan-${stamp}.png`, { type: 'image/png' });
    const { id: imageId } = await uploadStorageFile(
      file,
      { bucket: identity?.organizationId ?? '', kind: 'floor_plan' },
      target,
    );
    const { record: plan } = await mutate(FLOOR_PLAN_RESOURCE, {
      kind: 'createOne',
      input: {
        facility_id: facilityId,
        area_id: floor.id,
        name: `Plan ${stamp}`,
        level: 3,
        image_file_id: imageId,
        width_px: 1200,
        height_px: 800,
        scale_m_per_px: 0.05,
      },
    });
    expect(plan).toMatchObject({
      area_id: floor.id,
      image_file_id: imageId,
      width_px: 1200,
      height_px: 800,
    });
    expect((await presignStorageFile(imageId, target)).url).toMatch(/^http/);

    // The room lies on its floor's plan, as the shape input resolves it.
    const areas = rowsOf(await list(AREA_RESOURCE), planAreaOf);
    const plans = rowsOf(await list(FLOOR_PLAN_RESOURCE), floorPlanOf);
    const found = planOfChain(areaChain(String(room.id), String(floor.id), areas), plans);
    expect(found?.id).toBe(plan.id);

    const polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [100, 100],
          [300, 100],
          [300, 250],
          [100, 100],
        ],
      ],
    };
    expect(validateShape(polygon, found?.size ?? null)).toBeNull();
    const saved = await mutate(AREA_RESOURCE, {
      kind: 'updateOne',
      id: room.id,
      input: { shape: polygon },
    });
    expect(saved.record.shape).toEqual(polygon);
    const circle = { type: 'Circle', center: [600, 400], radius: 50 };
    expect(
      (await mutate(AREA_RESOURCE, { kind: 'updateOne', id: room.id, input: { shape: circle } }))
        .record.shape,
    ).toEqual(circle);
    expect(
      (await mutate(AREA_RESOURCE, { kind: 'updateOne', id: room.id, input: { shape: null } }))
        .record.shape,
    ).toBeNull();
  });

  it('refuses a ring of fewer than 3 distinct points, as the console does', async () => {
    const zone = await createArea({ name: `Zone ${stamp}` });
    const two = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [0, 0],
        ],
      ],
    };
    expect(validateShape(two, null)?.code).toBe('areaShape.tooFewPoints');
    await expect(
      mutate(AREA_RESOURCE, { kind: 'updateOne', id: zone.id, input: { shape: two } }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/areas_shape_valid|[Cc]heck constraint/),
    });
  });
});
