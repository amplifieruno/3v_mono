import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addEmbedding, axis, createIdentity, vectorLiteral } from './support/faces.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';

async function templates(identityId: string): Promise<number[]> {
  const rows = await runSqlRows(
    `select quality_score from itap.identity_embeddings where identity_id = '${identityId}' and is_template order by quality_score desc`,
  );
  return rows.map((r) => Number(r.quality_score));
}

describe('identity embeddings and template upkeep', () => {
  it('should mark exactly the five highest-quality embeddings as templates', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    for (const [i, q] of [0.3, 0.9, 0.1, 0.7, 0.5, 0.8, 0.2].entries()) {
      await addEmbedding(orgA.id, identity.id, axis(i), q);
    }
    expect(await templates(identity.id)).toEqual([0.9, 0.8, 0.7, 0.5, 0.3]);
  });

  it('should promote the next best embedding when a template is deleted', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    const ids: string[] = [];
    for (const [i, q] of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4].entries()) ids.push(await addEmbedding(orgA.id, identity.id, axis(i), q));
    await runSql(`delete from itap.identity_embeddings where id = '${ids[0]}'`);
    expect(await templates(identity.id)).toEqual([0.8, 0.7, 0.6, 0.5, 0.4]);
  });

  it('should refresh both identities when an embedding moves between identities', async () => {
    const { orgA, user } = await createTwoOrgs();
    const source = await createIdentity(user.id, orgA.id);
    const target = await createIdentity(user.id, orgA.id);
    const ids: string[] = [];
    for (const [i, q] of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4].entries()) ids.push(await addEmbedding(orgA.id, source.id, axis(i), q));
    for (const [i, q] of [0.35, 0.34, 0.33, 0.32, 0.31].entries()) await addEmbedding(orgA.id, target.id, axis(10 + i), q);

    await runSql(`update itap.identity_embeddings set identity_id = '${target.id}' where id = '${ids[0]}'`);
    expect(await templates(source.id)).toEqual([0.8, 0.7, 0.6, 0.5, 0.4]);
    expect(await templates(target.id)).toEqual([0.9, 0.35, 0.34, 0.33, 0.32]);
  });

  it('should never overwrite a stored embedding vector', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    const id = await addEmbedding(orgA.id, identity.id, axis(0), 0.5);
    await expect(
      runSql(`update itap.identity_embeddings set embedding = '${vectorLiteral(axis(1))}' where id = '${id}'`),
    ).rejects.toThrow(/embedding_immutable/);
  });

  it('should let org_admin read (without raw vectors) and delete embeddings but not create them or write templates', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    const identity = await createIdentity(user.id, orgA.id);
    const id = await addEmbedding(orgA.id, identity.id, axis(0), 0.5);

    const listed = await a.request<{ identity_embeddings: { id: string; is_template: boolean }[] }>(
      `query { identity_embeddings { id is_template quality_score } }`,
    );
    expect(listed.identity_embeddings).toMatchObject([{ id, is_template: true }]);
    // Raw biometric vectors are never exposed to org_admin (the UI never needs them).
    await expectDenied(a.request(`query { identity_embeddings { id embedding } }`), 'embedding');
    await expectDenied(
      a.request(`mutation($o: identity_embeddings_insert_input!) { insert_identity_embeddings_one(object: $o) { id } }`, {
        o: { identity_id: identity.id, embedding: vectorLiteral(axis(1)) },
      }),
      'insert_identity_embeddings_one',
    );
    await expectDenied(
      a.request(`mutation($id: uuid!) { update_identity_embeddings(where: { id: { _eq: $id } }, _set: { is_template: false }) { affected_rows } }`, { id }),
      'update_identity_embeddings',
    );

    const b = asOrgAdmin(other.id, orgB.id);
    expect((await b.request<{ identity_embeddings: unknown[] }>(`query { identity_embeddings { id } }`)).identity_embeddings).toEqual([]);
    const deleted = await a.request<{ delete_identity_embeddings_by_pk: { id: string } | null }>(
      `mutation($id: uuid!) { delete_identity_embeddings_by_pk(id: $id) { id } }`,
      { id },
    );
    expect(deleted.delete_identity_embeddings_by_pk?.id).toBe(id);
  });

  it('should reject embeddings of the wrong dimension and cascade on identity delete', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    const err = await expectError(addEmbedding(orgA.id, identity.id, [1, 0, 0], 0.5));
    expect(err.message).toMatch(/dimensions|expected 512/i);
    await addEmbedding(orgA.id, identity.id, axis(0), 0.5);
    await asOrgAdmin(user.id, orgA.id).request(`mutation($id: uuid!) { delete_identities_by_pk(id: $id) { id } }`, { id: identity.id });
    const left = await runSqlRows(`select count(*) as n from itap.identity_embeddings where identity_id = '${identity.id}'`);
    expect(left[0].n).toBe('0');
  });

  it('should not audit embeddings', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    const id = await addEmbedding(orgA.id, identity.id, axis(0), 0.5);
    const rows = await runSqlRows(`select count(*) as n from itap.audit_log where entity_id = '${id}'`);
    expect(rows[0].n).toBe('0');
  });
});
