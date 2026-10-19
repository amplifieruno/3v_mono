import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { addEmbedding, axis, createIdentity, vectorLiteral } from './support/faces.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';

/** itap.consider_template (spec §7): recognition adds an embedding only if it beats the worst of the top-5 templates. */

const CONSIDER = `
  mutation Consider($args: consider_template_args!) { consider_template(args: $args) { id is_template quality_score } }
`;

type Considered = { id: string; is_template: boolean; quality_score: number };

async function consider(orgId: string, identityId: string, quality: number, extra: Record<string, unknown> = {}): Promise<Considered[]> {
  const data = await asAdmin().request<{ consider_template: Considered[] }>(CONSIDER, {
    args: {
      p_organization_id: orgId,
      p_identity_id: identityId,
      p_embedding: vectorLiteral(axis(100)),
      p_quality: quality,
      p_model_version: 'test',
      ...extra,
    },
  });
  return data.consider_template;
}

async function qualities(identityId: string): Promise<number[]> {
  const rows = await runSqlRows(
    `select quality_score from itap.identity_embeddings where identity_id = '${identityId}' order by quality_score desc`,
  );
  return rows.map((r) => Number(r.quality_score));
}

describe('consider_template', () => {
  it('should add an embedding while the identity has fewer than five templates', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    await addEmbedding(orgA.id, identity.id, axis(0), 0.9);

    const added = await consider(orgA.id, identity.id, 0.1);
    expect(added).toHaveLength(1);
    expect(added[0].is_template).toBe(true);
    expect(await qualities(identity.id)).toEqual([0.9, 0.1]);
  });

  it('should add an embedding only when it beats the worst of the top five by more than 0.05', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    for (const [i, q] of [0.9, 0.8, 0.7, 0.6, 0.5].entries()) await addEmbedding(orgA.id, identity.id, axis(i), q);

    expect(await consider(orgA.id, identity.id, 0.4)).toEqual([]);
    expect(await consider(orgA.id, identity.id, 0.5)).toEqual([]);
    // Within the margin: camera noise around the worst template is not worth another stored embedding.
    expect(await consider(orgA.id, identity.id, 0.54)).toEqual([]);
    const added = await consider(orgA.id, identity.id, 0.56);
    expect(added).toHaveLength(1);
    expect(await qualities(identity.id)).toEqual([0.9, 0.8, 0.7, 0.6, 0.56, 0.5]);
    const templates = await runSqlRows(
      `select count(*) as n, min(quality_score) as worst from itap.identity_embeddings where identity_id = '${identity.id}' and is_template`,
    );
    expect(templates[0]).toEqual({ n: '5', worst: '0.56' });
  });

  it('should record the capture photo with its device and the source detection', async () => {
    const { orgA, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    const file = await runSqlRows(
      `insert into storage.files (bucket_id, name, mime_type, size, is_uploaded) values ('${orgA.id}', 'crop.jpg', 'image/jpeg', 10, true) returning id`,
    );
    const fileId = file[0].id as string;
    const detection = '00000000-0000-4000-8000-000000000001';

    const [added] = await consider(orgA.id, identity.id, 0.7, {
      p_photo_file_id: fileId,
      p_captured_at: '2026-10-01T10:00:00Z',
      p_source_detection_id: detection,
    });
    const embedding = await runSqlRows(
      `select photo_file_id, source_detection_id, model_version from itap.identity_embeddings where id = '${added.id}'`,
    );
    expect(embedding[0]).toEqual({ photo_file_id: fileId, source_detection_id: detection, model_version: 'test' });
    const photos = await runSqlRows(
      `select kind, quality_score, captured_at from itap.identity_photos where identity_id = '${identity.id}' and file_id = '${fileId}'`,
    );
    expect(photos).toEqual([{ kind: 'capture', quality_score: '0.7', captured_at: '2026-10-01 10:00:00+00' }]);
  });

  it('should add nothing for merged, archived or matching-disabled identities', async () => {
    const { orgA, user } = await createTwoOrgs();
    const archived = await createIdentity(user.id, orgA.id);
    await runSql(`update itap.identities set status = 'archived' where id = '${archived.id}'`);
    expect(await consider(orgA.id, archived.id, 0.9)).toEqual([]);

    const disabled = await createIdentity(user.id, orgA.id);
    await runSql(`update itap.identities set matching_enabled = false where id = '${disabled.id}'`);
    expect(await consider(orgA.id, disabled.id, 0.9)).toEqual([]);
    expect(await qualities(archived.id)).toEqual([]);
    expect(await qualities(disabled.id)).toEqual([]);
  });

  it('should add nothing for an identity of another organization', async () => {
    const { orgA, orgB, user } = await createTwoOrgs();
    const identity = await createIdentity(user.id, orgA.id);
    expect(await consider(orgB.id, identity.id, 0.9)).toEqual([]);
    expect(await qualities(identity.id)).toEqual([]);
  });

  it('should not be exposed to org_admin', async () => {
    const { orgA, user } = await createTwoOrgs();
    await expectError(asOrgAdmin(user.id, orgA.id).request(CONSIDER, { args: {} }));
  });
});
