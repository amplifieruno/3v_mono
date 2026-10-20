import { describe, expect, it } from 'vitest';
import {
  APP_FIELDS,
  authWorld,
  backendActor,
  createApp,
  KEY_FIELDS,
  newPrefix,
  storeKey,
  type ClientKey,
} from './support/authService.js';
import { manualSegment } from './support/segments.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { callFn, insertOne, updateByPk } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

const revokeKey = (client: Parameters<typeof callFn>[0], key: string): Promise<ClientKey> =>
  callFn<ClientKey>(client, 'revoke_client_key', { p_key: key }, KEY_FIELDS);

describe('client applications', () => {
  it('should number apps APP-xxxxx, stamp created_by and check the threshold range', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    expect(app.code).toMatch(/^APP-\d{5}$/);
    expect(app).toMatchObject({ created_by: w.user.id, status: 'active', is_sandbox: false, liveness_required: true });
    const bad = await expectError(createApp(w.a, { threshold_min: 0.7, threshold: 0.6 }));
    expect(bad.message).toContain('client_applications_threshold_range');
    const over = await expectError(createApp(w.a, { threshold_max: 1.2 }));
    expect(over.message).toContain('client_applications_threshold_range');
    await expectDenied(updateByPk(w.a, 'client_applications', app.id, { number: 7 }), 'number');
  });

  it('should keep is_sandbox immutable after insert (metadata and trigger)', async () => {
    const w = await authWorld();
    const app = await createApp(w.a, { is_sandbox: true });
    expect(app.is_sandbox).toBe(true);
    await expectDenied(updateByPk(w.a, 'client_applications', app.id, { is_sandbox: false }), 'is_sandbox');
    await expect(runSql(`update itap.client_applications set is_sandbox = false where id = '${app.id}'`)).rejects.toThrow(
      /client_application_sandbox_immutable/,
    );
  });

  it('should make revoked terminal', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    await updateByPk(w.a, 'client_applications', app.id, { status: 'suspended' });
    await updateByPk(w.a, 'client_applications', app.id, { status: 'revoked' });
    const back = await expectError(updateByPk(w.a, 'client_applications', app.id, { status: 'active' }));
    expect(back.message).toContain('client_application_revoked');
  });

  it('should bind modes, attributes, segments, facilities and access points within the organization', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    await insertOne(w.a, 'client_application_modes', { application_id: app.id, mode: 'identification' });
    await insertOne(w.a, 'client_application_attributes', { application_id: app.id, attribute: 'display_name' });
    await insertOne(w.a, 'client_application_segments', { application_id: app.id, segment_id: w.segment.id });
    await insertOne(w.a, 'client_application_facilities', { application_id: app.id, facility_id: w.facility.id });
    await insertOne(w.a, 'client_application_access_points', { application_id: app.id, access_point_id: w.door.id });
    const dup = await expectError(insertOne(w.a, 'client_application_modes', { application_id: app.id, mode: 'identification' }));
    expect(dup.message).toMatch(/client_application_modes_key|Uniqueness/);
    const badMode = await expectError(insertOne(w.a, 'client_application_modes', { application_id: app.id, mode: 'enroll' }));
    expect(badMode.message).toMatch(/expected one of the values/);
    const badAttr = await expectError(
      insertOne(w.a, 'client_application_attributes', { application_id: app.id, attribute: 'date_of_birth' }),
    );
    expect(badAttr.message).toMatch(/expected one of the values/);

    const segmentB = await manualSegment(w.b, 'profiles');
    const foreign = await expectError(insertOne(w.a, 'client_application_segments', { application_id: app.id, segment_id: segmentB.id }));
    expect(foreign.message).toMatch(/foreign key|Foreign key/);
    const appOfA = await expectError(insertOne(w.b, 'client_application_segments', { application_id: app.id, segment_id: segmentB.id }));
    expect(appOfA.message).toMatch(/foreign key|Foreign key/);
    const seen = await w.b.request<{ client_applications: unknown[] }>(`{ client_applications { id } }`);
    expect(seen.client_applications).toEqual([]);
  });

  it('should refuse facility and access point bindings on sandbox apps (segments allowed)', async () => {
    const w = await authWorld();
    const sandbox = await createApp(w.a, { is_sandbox: true });
    await insertOne(w.a, 'client_application_segments', { application_id: sandbox.id, segment_id: w.segment.id });
    const facility = await expectError(
      insertOne(w.a, 'client_application_facilities', { application_id: sandbox.id, facility_id: w.facility.id }),
    );
    expect(facility.message).toContain('sandbox_location_binding');
    const door = await expectError(
      insertOne(w.a, 'client_application_access_points', { application_id: sandbox.id, access_point_id: w.door.id }),
    );
    expect(door.message).toContain('sandbox_location_binding');
  });
});

describe('client application keys', () => {
  it('should store keys only through the backend (admin) function and never expose secret_hash', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    await expectDenied(storeKey(w.a, app.id), 'store_client_key');
    const key = await storeKey(backendActor(w.user.id, w.orgA.id), app.id);
    expect(key).toMatchObject({ application_id: app.id, created_by: w.user.id, revoked_at: null });
    expect(key.key_prefix).toHaveLength(8);
    await expectDenied(w.a.request(`{ client_application_keys { id secret_hash } }`), 'secret_hash');
    const listed = await w.a.request<{ client_application_keys: { id: string }[] }>(`{ client_application_keys { ${KEY_FIELDS} } }`);
    expect(listed.client_application_keys.map((k) => k.id)).toEqual([key.id]);
    await expectDenied(
      insertOne(w.a, 'client_application_keys', { application_id: app.id, key_prefix: newPrefix(), secret_hash: 'x' }),
      'insert_client_application_keys_one',
    );
    await expectDenied(updateByPk(w.a, 'client_application_keys', key.id, { expires_at: null }), 'update_client_application_keys_by_pk');
    await expect(runSql(`update itap.client_application_keys set secret_hash = 'other' where id = '${key.id}'`)).rejects.toThrow(
      /client_key_not_editable/,
    );
    const hashes = await runSqlRows(`select secret_hash from itap.client_application_keys where id = '${key.id}'`);
    expect(hashes[0].secret_hash).toBe('scrypt$16384$8$1$c2FsdA$aGFzaA');
  });

  it('should validate prefix format and uniqueness, expiry and the application', async () => {
    const w = await authWorld();
    const actor = backendActor(w.user.id, w.orgA.id);
    const app = await createApp(w.a);
    const short = await expectError(storeKey(actor, app.id, { p_key_prefix: 'abc' }));
    expect(short.message).toContain('client_application_keys_prefix_format');
    const key = await storeKey(actor, app.id);
    const dup = await expectError(storeKey(actor, app.id, { p_key_prefix: key.key_prefix }));
    expect(dup.message).toMatch(/client_application_keys_key_prefix_key|Uniqueness/);
    const past = await expectError(storeKey(actor, app.id, { p_expires_at: new Date(Date.now() - 1000).toISOString() }));
    expect(past.message).toContain('client_key_expiry_invalid');
    const appB = await createApp(w.b);
    const foreign = await expectError(storeKey(actor, appB.id));
    expect(foreign.message).toContain('client_application_not_found');
    const revokedApp = await createApp(w.a, { status: 'revoked' });
    const refused = await expectError(storeKey(actor, revokedApp.id));
    expect(refused.message).toContain('client_application_revoked');
  });

  it('should allow at most two active keys per application (rotation overlap)', async () => {
    const w = await authWorld();
    const actor = backendActor(w.user.id, w.orgA.id);
    const app = await createApp(w.a);
    // An expired key (written directly, as time would leave it) does not count.
    await runSql(
      `insert into itap.client_application_keys (organization_id, application_id, key_prefix, secret_hash, expires_at)
       values ('${w.orgA.id}', '${app.id}', '${newPrefix()}', 'x', now() - interval '1 s')`,
    );
    const first = await storeKey(actor, app.id);
    await storeKey(actor, app.id);
    const third = await expectError(storeKey(actor, app.id));
    expect(third.message).toContain('client_key_limit');
    const revoked = await revokeKey(w.a, first.id);
    expect(revoked).toMatchObject({ revoked_by: w.user.id });
    expect(revoked.revoked_at).not.toBeNull();
    await storeKey(actor, app.id);
  });

  it('should revoke once, only inside the organization, by an active member', async () => {
    const w = await authWorld();
    const app = await createApp(w.a);
    const key = await storeKey(backendActor(w.user.id, w.orgA.id), app.id);
    const foreign = await expectError(revokeKey(w.b, key.id));
    expect(foreign.message).toContain('client_key_not_found');
    await revokeKey(w.a, key.id);
    const again = await expectError(revokeKey(w.a, key.id));
    expect(again.message).toContain('client_key_revoked');
    await expect(runSql(`update itap.client_application_keys set revoked_at = null where id = '${key.id}'`)).rejects.toThrow(
      /client_key_not_editable/,
    );
    // last_used_at is the one free system write (key auth middleware).
    await runSql(`update itap.client_application_keys set last_used_at = now() where id = '${key.id}'`);
    const audit = await runSqlRows(
      `select action, changes::text as changes from itap.audit_log where entity = 'client_application_keys' and entity_id = '${key.id}' order by occurred_at`,
    );
    expect(audit.map((r) => r.action)).toEqual(['insert', 'update']);
    for (const row of audit) expect(row.changes).not.toContain('scrypt$');
  });

  it('should list app fields for org_admin with the generated code', async () => {
    const w = await authWorld();
    await createApp(w.a);
    const data = await w.a.request<{ client_applications: { code: string }[] }>(`{ client_applications { ${APP_FIELDS} } }`);
    expect(data.client_applications).toHaveLength(1);
  });
});
