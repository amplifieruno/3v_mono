import { fieldSensitivity } from '@burojs/core';
import { f } from '@burojs/field-types';
import { describe, expect, it } from 'vitest';
import { hasuraTable, selectFieldsOf } from '../../src/data/mapping';
import { secret } from '../../src/fields/secret';
import { app } from '../../src/app/app-definition';
import { ITAP_TABLES } from '../../src/modules';

describe('hasuraTable', () => {
  it('should default to a uuid `id` primary key ordered by `created_at`', () => {
    expect(hasuraTable('areas', { selectFields: ['id', 'name'] })).toEqual({
      table: 'areas',
      selectFields: ['id', 'name'],
      pkType: 'uuid',
      pkField: 'id',
      orderByField: 'created_at',
    });
  });

  it('should let a mapping override a default', () => {
    const mapping = hasuraTable('detections', {
      selectFields: ['id'],
      orderByField: 'detected_at',
      noAggregate: true,
    });
    expect(mapping.orderByField).toBe('detected_at');
    expect(mapping.noAggregate).toBe(true);
    expect(mapping.pkType).toBe('uuid');
  });

  it('should select nothing when no field list is given', () => {
    expect(hasuraTable('areas').selectFields).toEqual([]);
  });
});

describe('selectFieldsOf', () => {
  it('should return the declared column names and skip links', () => {
    const fields = {
      id: f.uuid(),
      name: f.string(),
      facility_id: f.relation({ to: 'facility' }),
      segments: f.relationMany({
        to: 'segment',
        through: { resource: 'segment_member', sourceKey: 'profile_id', targetKey: 'segment_id' },
      }),
    };
    expect(selectFieldsOf(fields)).toEqual(['id', 'name', 'facility_id']);
  });

  it('should skip dotted names', () => {
    expect(selectFieldsOf({ id: f.uuid(), 'company_id.name': f.string() })).toEqual(['id']);
  });

  it('should skip write-only secrets, which the role may not select', () => {
    expect(selectFieldsOf({ id: f.uuid(), username: f.string(), password: secret() })).toEqual([
      'id',
      'username',
    ]);
    expect(ITAP_TABLES.device?.selectFields).not.toContain('password');
    expect(ITAP_TABLES.device?.selectFields).toContain('username');
    expect(ITAP_TABLES.webhook_subscription?.selectFields).not.toContain('secret');
    expect(ITAP_TABLES.webhook_subscription?.selectFields).toContain('url');
  });

  it('should mark a secret sensitive, so a typed value never lands in a draft or an audit event', async () => {
    await app.ready;
    // What buro's drafts and audit read off the registered field.
    const device = app.registry.get('device') as { fields: Record<string, unknown> };
    expect(fieldSensitivity(device.fields.password)).toBe(true);
    expect(fieldSensitivity(device.fields.username)).toBeUndefined();
  });
});

describe('append-only logs', () => {
  const LOGS = ['device_health_metric', 'device_event', 'detection', 'tracking_session', 'identity_location', 'incident_activity', 'notification_delivery', 'webhook_delivery'];

  it('should page the logs by cursor and count them only on demand', async () => {
    await app.ready;
    for (const name of LOGS) {
      expect(ITAP_TABLES[name]?.noAggregate, name).toBe(true);
      const def = app.registry.get(name) as {
        operations?: Record<string, boolean>;
        views?: { list?: { count?: string; pagination?: string } };
      };
      expect(def.views?.list?.count, name).toBe('manual');
      expect(def.views?.list?.pagination, name).toBe('cursor');
      expect(def.operations, name).toMatchObject({ create: false, edit: false, delete: false });
      // Keyset cursors need the sort column and the key among the selected columns.
      const mapping = ITAP_TABLES[name];
      expect(mapping?.selectFields, name).toContain(mapping?.orderByField);
      expect(mapping?.selectFields, name).toContain('id');
    }
  });

  it('should page the event log by offset so it can poll, still counting only on demand', async () => {
    // buro ignores `refetchInterval` on a cursor list (accumulated pages), and operators watch events live.
    await app.ready;
    expect(ITAP_TABLES.event?.noAggregate).toBe(true);
    const def = app.registry.get('event') as {
      operations?: Record<string, boolean>;
      views?: { list?: { count?: string; pagination?: string; refetchInterval?: number } };
    };
    expect(def.views?.list?.count).toBe('manual');
    expect(def.views?.list?.pagination).toBeUndefined();
    expect(def.views?.list?.refetchInterval).toBeGreaterThan(0);
    expect(def.operations).toMatchObject({ create: false, edit: false, delete: false });
  });

  it('should leave the aggregate on for every table that is not a log', () => {
    const noAggregate = Object.entries(ITAP_TABLES)
      .filter(([, mapping]) => mapping.noAggregate)
      .map(([name]) => name)
      .sort();
    expect(noAggregate).toEqual([...LOGS, 'event'].sort());
  });
});

describe('ITAP_TABLES', () => {
  it('should map every resource to a uuid primary key that it selects', () => {
    const entries = Object.entries(ITAP_TABLES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [, mapping] of entries) {
      expect(mapping.pkType).toBe('uuid');
      expect(mapping.selectFields).toContain(mapping.pkField ?? 'id');
    }
  });

  it('should map the organization and facility resources to their Hasura roots', () => {
    expect(ITAP_TABLES.organization?.table).toBe('organizations');
    expect(ITAP_TABLES.facility?.table).toBe('facilities');
  });
});
