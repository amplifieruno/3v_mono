import { afterEach, describe, expect, it } from 'vitest';
import { runSql, runSqlRows } from './support/sql.js';
import { evaluate } from './support/stageB.js';
import { createTrackingWorld, detect } from './support/tracking.js';

const TRIGGER = 'zz_test_slow_event_insert';

afterEach(async () => {
  await runSql(`DROP TRIGGER IF EXISTS ${TRIGGER} ON itap.events; DROP FUNCTION IF EXISTS itap.zz_test_slow_event_insert();`);
});

describe('Stage B on a vanished organization / detection', () => {
  it('should be a no-op success when the organization is deleted while the detection is evaluated', async () => {
    const w = await createTrackingWorld();
    const d = await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    // Test-only: the first event insert of this organization waits 1.5 s, so the organization delete below commits
    // between Stage B reading the detection and its event insert (whose FK check then finds no organization).
    await runSql(`
      CREATE FUNCTION itap.zz_test_slow_event_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(1.5); RETURN NEW; END $$;
      CREATE TRIGGER ${TRIGGER} BEFORE INSERT ON itap.events FOR EACH ROW
      WHEN (NEW.organization_id = '${w.orgA.id}') EXECUTE FUNCTION itap.zz_test_slow_event_insert();`);
    const evaluation = evaluate(d.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await runSql(`DELETE FROM itap.organizations WHERE id = '${w.orgA.id}'`);
    await expect(evaluation).resolves.toEqual([]);
    expect(await runSqlRows(`SELECT id FROM itap.detections WHERE id = '${d.id}'`)).toEqual([]);
    // A redelivery after the delete is a no-op as well.
    expect(await evaluate(d.id)).toEqual([]);
  });
});
