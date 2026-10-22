import { describe, expect, it } from 'vitest';
import { createProfile } from './support/segments.js';
import { runSql } from './support/sql.js';
import { createTrackingWorld, detect } from './support/tracking.js';

/**
 * The console's computed person fields of a detection (migration 274, plan 05 Review Focus 3): `profile_id` follows the
 * identity's link now, and `person_erased` turns true once that person is a tombstone (an erasure that kept the
 * identity, e.g. under a legal hold), so the console shows "erased" instead of the tombstone's name. Runs in a
 * disposable test organization; the tombstone is made the way `itap.dsr_erase` makes it (retention context).
 */

type DetectionPerson = { profile_id: string | null; person_erased: boolean };

describe('detection person fields', () => {
  it('should follow the identity’s person and say when that person was erased', async () => {
    const w = await createTrackingWorld();
    const person = await createProfile(w.a);
    await runSql(`update itap.identities set profile_id = '${person}' where id = '${w.identity}'`);
    const detection = await detect(w.orgA.id, w.lobbyCam, w.identity, 10);
    const read = async (): Promise<DetectionPerson> =>
      (
        await w.a.request<{ detections_by_pk: DetectionPerson }>(
          'query($id: uuid!) { detections_by_pk(id: $id) { profile_id person_erased } }',
          { id: detection.id },
        )
      ).detections_by_pk;
    expect(await read()).toEqual({ profile_id: person, person_erased: false });

    await runSql(`
      select set_config('itap.retention_context', 'on', true);
      update itap.profiles set erased_at = now(), first_name = 'Erased subject', last_name = code where id = '${person}';`);
    expect(await read()).toEqual({ profile_id: person, person_erased: true });
  });

  it('should leave an unknown face without a person', async () => {
    const w = await createTrackingWorld();
    const detection = await detect(w.orgA.id, w.lobbyCam, w.identity, 10);
    const row = await w.a.request<{ detections_by_pk: DetectionPerson }>(
      'query($id: uuid!) { detections_by_pk(id: $id) { profile_id person_erased } }',
      { id: detection.id },
    );
    expect(row.detections_by_pk).toEqual({ profile_id: null, person_erased: false });
  });
});
