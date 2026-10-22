import { type DataProvider, type QueryContext, createQueryDescriptor } from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ItapAuthProvider } from '../../src/auth';
import { MONITORING_BINDING, occupancyRow } from '../../src/blocks/occupancy-now/occupancy-query';
import { withOccupancy } from '../../src/blocks/occupancy-now/occupancy-level';
import { createItapHasuraProvider } from '../../src/data/provider';
import {
  AREA_RESOURCE,
  DETECTION_RESOURCE,
  FACILITY_RESOURCE,
  IDENTITY_LOCATION_RESOURCE,
  TRACKING_SESSION_RESOURCE,
} from '../../src/data/resource-names';
import { presignStorageFile } from '../../src/fields/storage-client';
import { planAreaOf, rowsOf } from '../../src/fields/plan-rows';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, DEV_STORAGE, NOVA_NAME, signInDev } from '../support/dev-stack';

/**
 * Monitoring reads against the dev stack (Nova, `org_admin`, the seeded history) through the
 * console's provider: detections of a person through the computed `profile_id` (the profile's
 * Detections tab and the known / unknown views), a new-identity detection linking to its
 * identity and a readable photo (Review Focus 3), a session's path, and the occupancy page's
 * figures agreeing with the area tree's `current_occupancy` and the facility's for every
 * facility (Review Focus 4). Read only: nothing to clean up.
 */

const IDENTITY = {
  providerId: 'hasura',
  sessionKey: 'monitoring-dev-test',
  scopeKey: null,
  bindingRevision: '1',
} as const;

function context(): QueryContext {
  return {
    signal: new AbortController().signal,
    requestContext: {},
    session: { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 },
    providerServiceKey: 'hasura',
  } as QueryContext;
}

type Row = Readonly<Record<string, unknown>>;

const ref = (id: string) => ({ namespace: 'default', id });

describe.skipIf(!DEV_STACK_ENABLED)('monitoring against the dev stack (Nova Tower)', () => {
  let auth: ItapAuthProvider;
  let provider: DataProvider;

  const list = async (
    resource: string,
    filter: Row | null,
    sort: readonly { field: string; direction: 'asc' | 'desc' }[] = [],
    perPage = 50,
  ): Promise<readonly Row[]> => {
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: ref(resource),
        resource,
        pagination: { mode: 'offset', page: 1, perPage },
        ...(filter === null ? {} : { filter }),
        sort,
      } as never) as never,
      context(),
    )) as { data: readonly Row[] };
    return data;
  };

  const graphql = async (query: string, variables: Row = {}): Promise<Row> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.getToken()}` },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as { data?: Row; errors?: unknown };
    expect(body.errors, JSON.stringify(body.errors)).toBeUndefined();
    return body.data ?? {};
  };

  beforeAll(async () => {
    auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
  });

  it('should list a person’s detections through the computed profile of their identities', async () => {
    const known = await list(DETECTION_RESOURCE, { field: 'profile_id', op: 'isNotNull' }, [
      { field: 'detected_at', direction: 'desc' },
    ]);
    expect(known.length).toBeGreaterThan(0);
    const person = String(known[0]?.profile_id);
    const theirs = await list(DETECTION_RESOURCE, { field: 'profile_id', op: 'eq', value: person });
    expect(theirs.length).toBeGreaterThan(0);
    const identities = (await graphql(
      'query ($p: uuid!) { identities(where: { profile_id: { _eq: $p } }) { id } }',
      { p: person },
    )).identities as readonly { id: string }[];
    const ids = new Set(identities.map((row) => row.id));
    expect(theirs.every((row) => ids.has(String(row.identity_id)) && row.person_erased === false)).toBe(true);

    const unknown = await list(DETECTION_RESOURCE, {
      and: [
        { field: 'identity_id', op: 'isNotNull' },
        { field: 'profile_id', op: 'isNull' },
      ],
    });
    expect(unknown.every((row) => row.identity_id !== null && row.profile_id === null)).toBe(true);
  });

  it('should link a new-identity detection to the identity it created and its photo (Review Focus 3)', async () => {
    const created = await list(
      DETECTION_RESOURCE,
      { field: 'is_new_identity', op: 'eq', value: true },
      [{ field: 'detected_at', direction: 'desc' }],
      5,
    );
    const withPhoto = created.find((row) => typeof row.thumbnail_file_id === 'string' && row.identity_id !== null);
    expect(withPhoto, 'a seeded new-identity detection with its crop').toBeDefined();
    const photos = (await graphql(
      'query ($i: uuid!) { identity_photos(where: { identity_id: { _eq: $i } }) { file_id } }',
      { i: withPhoto?.identity_id },
    )).identity_photos as readonly { file_id: string }[];
    expect(photos.map((row) => row.file_id)).toContain(withPhoto?.thumbnail_file_id);
    const { url } = await presignStorageFile(String(withPhoto?.thumbnail_file_id), {
      base: DEV_STORAGE,
      getToken: () => auth.getToken(),
    });
    expect((await fetch(url)).ok).toBe(true);
  });

  it('should read a session’s path as the locations of that session', async () => {
    const sessions = await list(TRACKING_SESSION_RESOURCE, { field: 'status', op: 'eq', value: 'completed' }, [
      { field: 'started_at', direction: 'desc' },
    ], 5);
    const session = sessions[0];
    expect(session).toBeDefined();
    const path = await list(IDENTITY_LOCATION_RESOURCE, { field: 'session_id', op: 'eq', value: session?.id }, [
      { field: 'occurred_at', direction: 'asc' },
    ]);
    expect(path.length).toBeGreaterThan(0);
    expect(path[0]?.movement_type).toBe('entry');
    expect(new Set(path.map((row) => row.facility_id))).toEqual(new Set([session?.facility_id]));
  });

  it('should show on the occupancy page what the area tree and the facility count (Review Focus 4)', async () => {
    const facilities = await list(FACILITY_RESOURCE, null);
    expect(facilities.length).toBeGreaterThan(0);
    for (const facility of facilities) {
      const answer = await provider.queries?.custom?.(
        createQueryDescriptor({
          ...IDENTITY,
          kind: 'custom',
          ref: ref('itap:occupancy-rows'),
          resource: MONITORING_BINDING,
          operation: 'occupancyRows',
          input: { facilityId: facility.id },
        } as never) as never,
        context(),
      );
      const rows = occupancyRow.array().parse(answer);
      const areas = await list(AREA_RESOURCE, { field: 'facility_id', op: 'eq', value: facility.id }, [], 100);
      const drawn = withOccupancy(rowsOf(areas, planAreaOf), rows);
      for (const area of drawn) {
        const tree = areas.find((row) => row.id === area.id);
        expect(area.current_occupancy, `area ${area.name}`).toBe(tree?.current_occupancy);
      }
      expect(rows.find((row) => row.area_id === null)?.occupancy, `facility ${String(facility.name)}`).toBe(
        facility.current_occupancy,
      );
    }
  });
});
