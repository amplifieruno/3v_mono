import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, createTwoOrgs } from './support/fixtures.js';
import { insertOne } from './support/operations.js';

type AuditRow = { entity: string; entity_id: string };
const AUDIT = `query($entities: [String!]!) { audit_log(where: { entity: { _in: $entities } }) { entity entity_id } }`;

describe('audit_log of user-owned entities', () => {
  it('should show subscription and workspace audit rows to their owner only, other entities to every admin', async () => {
    const { orgA, user } = await createTwoOrgs();
    const mate = await createTestUser();
    await addMember(orgA.id, mate.id);
    const a = asOrgAdmin(user.id, orgA.id);
    const b = asOrgAdmin(mate.id, orgA.id);
    const sub = await insertOne(a, 'notification_subscriptions', { event_type: 'tailgating', channel: 'email' });
    const ws = await insertOne(a, 'operator_workspaces', { name: 'mine', layout: {} });
    const group = await insertOne(a, 'recipient_groups', { name: 'shared config' });
    const entities = ['notification_subscriptions', 'operator_workspaces', 'recipient_groups'];
    const seenByA = (await a.request<{ audit_log: AuditRow[] }>(AUDIT, { entities })).audit_log;
    expect(seenByA.map((r) => r.entity_id).sort()).toEqual([sub.id, ws.id, group.id].sort());
    const seenByB = (await b.request<{ audit_log: AuditRow[] }>(AUDIT, { entities })).audit_log;
    expect(seenByB).toEqual([{ entity: 'recipient_groups', entity_id: group.id }]);
  });
});
