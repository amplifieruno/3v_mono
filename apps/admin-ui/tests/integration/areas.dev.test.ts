import {
  type DataProvider,
  type MutationContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { AREA_RESOURCE } from '../../src/modules/places/area';
import { isInsideArea } from '../../src/modules/places/area-tree';
import { FACILITY_RESOURCE } from '../../src/modules/places/facility';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Areas of a facility created for the test in Nova Tower, through the console's provider as
 * `org_admin`: the facility read scope (what the sidebar picker sets) narrows the area list to
 * one facility and an empty selection lists all (Review Focus 1); moving an area under its own
 * sub-area is refused by the database's cycle guard (Review Focus 2), and the path the console's
 * form check reads marks that sub-area as inside the moved one. Everything created is deleted.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'areas-dev-test',
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

/** The read scope the sidebar picker produces for the area list (`data.scope` key `facility`). */
const facilityScope = (values: readonly string[]) => ({
  narrowed: true,
  dimensions: { facility: { field: 'facility_id', values: [...values], empty: 'unset' } },
});

describe.skipIf(!DEV_STACK_ENABLED)('areas against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  const stamp = Date.now();
  let facilityId = '';

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

  const query = (resource: string, input: Record<string, unknown>) =>
    provider.queries?.[input.kind as 'one']?.(
      createQueryDescriptor({
        ...IDENTITY,
        ref: { namespace: 'default', id: resource },
        resource,
        ...input,
      } as never) as never,
      context(),
    ) as Promise<{ data: unknown }>;

  const createArea = async (name: string, parent: string | null) => {
    const { record } = await mutate(AREA_RESOURCE, {
      kind: 'createOne',
      input: { facility_id: facilityId, parent_id: parent, name, area_type: 'zone' },
    });
    return record;
  };

  const listAreas = async (scope: ReturnType<typeof facilityScope>) => {
    const { data } = await query(AREA_RESOURCE, {
      kind: 'list',
      pagination: { page: 1, pageSize: 500 },
      readScope: scope,
    });
    return data as readonly Record<string, unknown>[];
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    const { record } = await mutate(FACILITY_RESOURCE, {
      kind: 'createOne',
      input: { name: `dev-test areas ${stamp}`, timezone: 'UTC' },
    });
    facilityId = String(record.id);
  });

  afterAll(async () => {
    // Deepest first: an area with sub-areas cannot be deleted.
    const rows = facilityId ? await listAreas(facilityScope([facilityId])) : [];
    const deepestFirst = [...rows].sort((a, b) => Number(b.depth) - Number(a.depth));
    for (const row of deepestFirst) await mutate(AREA_RESOURCE, { kind: 'deleteOne', id: row.id });
    if (facilityId) await mutate(FACILITY_RESOURCE, { kind: 'deleteOne', id: facilityId });
  });

  it('narrows the areas to the selected facility, and lists all with none selected', async () => {
    const building = await createArea(`Building ${stamp}`, null);
    expect(building).toMatchObject({ depth: 0, path: [building.id], current_occupancy: 0 });

    const narrowed = await listAreas(facilityScope([facilityId]));
    expect(narrowed.map((row) => row.id)).toEqual([building.id]);

    const all = await listAreas(facilityScope([]));
    expect(all.some((row) => row.id === building.id)).toBe(true);
    expect(all.some((row) => row.facility_id !== facilityId)).toBe(true);
  });

  it('refuses moving an area under its own descendant', async () => {
    const top = await createArea(`Top ${stamp}`, null);
    const middle = await createArea(`Middle ${stamp}`, String(top.id));
    const leaf = await createArea(`Leaf ${stamp}`, String(middle.id));
    expect(leaf).toMatchObject({ depth: 2, path: [top.id, middle.id, leaf.id] });

    // What the form's parent check reads: the chosen parent's path holds the moved area.
    expect(isInsideArea(leaf.path, String(top.id))).toBe(true);
    await expect(
      mutate(AREA_RESOURCE, { kind: 'updateOne', id: top.id, input: { parent_id: leaf.id } }),
    ).rejects.toMatchObject({ message: expect.stringContaining('area_cycle') });
    await expect(
      mutate(AREA_RESOURCE, { kind: 'updateOne', id: top.id, input: { parent_id: top.id } }),
    ).rejects.toMatchObject({ message: expect.stringContaining('area_cycle') });

    // A legal move rewrites the subtree's paths.
    const other = await createArea(`Other ${stamp}`, null);
    await mutate(AREA_RESOURCE, { kind: 'updateOne', id: middle.id, input: { parent_id: other.id } });
    const { data } = await query(AREA_RESOURCE, { kind: 'one', id: leaf.id });
    expect(data).toMatchObject({ depth: 2, path: [other.id, middle.id, leaf.id] });
  });
});
