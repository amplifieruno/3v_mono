import type { AuthContext } from '@burojs/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { createItapAuthProvider } from '../../src/auth/auth-provider';
import { createNhostClient } from '../../src/auth/nhost-client';
import { createOrgClient } from '../../src/auth/org-client';
import { createTokenStore } from '../../src/auth/token-store';
import { ITAP_TABLES } from '../../src/data/mapping';
import { ENUM_TABLES } from '../../src/enums';

/**
 * The mapping contract against the live schema: every `ITAP_TABLES` entry and
 * every registered enum is checked by introspection as `org_admin` (the role
 * the console runs as), so a wrong `custom_name`, pk type, column or enum
 * value fails here rather than on a screen. Needs the dev stack and the seed.
 */

const enabled = process.env.ITAP_DEV_STACK === '1';
const GRAPHQL = 'http://localhost:8080/v1/graphql';

interface TypeRef {
  readonly name: string | null;
  readonly kind: string;
  readonly ofType: TypeRef | null;
}
interface IntrospectedField {
  readonly name: string;
  readonly type: TypeRef;
  readonly args: readonly { readonly name: string; readonly type: TypeRef }[];
}
interface IntrospectedType {
  readonly fields: readonly IntrospectedField[] | null;
  readonly enumValues: readonly { readonly name: string }[] | null;
}

const TYPE_REF = 'name kind ofType { name kind ofType { name kind ofType { name kind } } }';

async function graphql<T>(token: string, query: string): Promise<T> {
  const response = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const body = (await response.json()) as { data?: T; errors?: unknown };
  expect(body.errors).toBeUndefined();
  if (body.data === undefined) throw new Error('GraphQL answered no data');
  return body.data;
}

/** The named type under NON_NULL / LIST wrappers, with its wrapping spelled out (`uuid!`). */
function spell(ref: TypeRef): string {
  if (ref.kind === 'NON_NULL' && ref.ofType) return `${spell(ref.ofType)}!`;
  if (ref.kind === 'LIST' && ref.ofType) return `[${spell(ref.ofType)}]`;
  return ref.name ?? '?';
}

function namedType(ref: TypeRef): string {
  return ref.ofType ? namedType(ref.ofType) : (ref.name ?? '?');
}

describe.skipIf(!enabled)('Hasura mapping against the live schema (org_admin)', () => {
  let token = '';
  let roots: Map<string, IntrospectedField>;

  async function typeOf(name: string): Promise<IntrospectedType | null> {
    const data = await graphql<{ __type: IntrospectedType | null }>(
      token,
      `{ __type(name: "${name}") { fields { name type { ${TYPE_REF} } args { name type { ${TYPE_REF} } } } enumValues { name } } }`,
    );
    return data.__type;
  }

  beforeAll(async () => {
    const password = process.env.SEED_PASSWORD;
    expect(password).toBeTruthy();
    const provider = createItapAuthProvider({
      store: createTokenStore(undefined),
      nhost: createNhostClient({ baseUrl: 'http://localhost:4100/v1' }),
      org: createOrgClient({ endpoint: GRAPHQL }),
    });
    const result = await provider.login?.(
      { email: 'admin@itap.demo', password },
      {} as AuthContext,
    );
    expect(result).toEqual({ success: true });
    token = (await provider.getToken()) ?? '';
    expect(token).toBeTruthy();

    const data = await graphql<{ __schema: { queryType: { fields: IntrospectedField[] } } }>(
      token,
      `{ __schema { queryType { fields { name type { ${TYPE_REF} } args { name type { ${TYPE_REF} } } } } } }`,
    );
    roots = new Map(data.__schema.queryType.fields.map((field) => [field.name, field]));
    await app.ready;
  });

  it('should find every mapped table, its by-pk root, its aggregate and its columns', async () => {
    const problems: string[] = [];
    for (const [resource, mapping] of Object.entries(ITAP_TABLES)) {
      const where = `${resource} (${mapping.table})`;
      const list = roots.get(mapping.table);
      if (!list) {
        problems.push(`${where}: no root field`);
        continue;
      }
      const byPk = roots.get(`${mapping.table}_by_pk`);
      const pkArg = byPk?.args.find((arg) => arg.name === (mapping.pkField ?? 'id'));
      if (!pkArg || spell(pkArg.type) !== `${mapping.pkType}!`) {
        problems.push(`${where}: no ${mapping.table}_by_pk(id: ${mapping.pkType}!)`);
      }
      if (mapping.aggregate !== false && !roots.has(`${mapping.table}_aggregate`)) {
        problems.push(`${where}: no ${mapping.table}_aggregate`);
      }
      const rowType = await typeOf(namedType(list.type));
      const columns = new Set((rowType?.fields ?? []).map((field) => field.name));
      for (const column of mapping.selectFields) {
        if (!columns.has(column)) problems.push(`${where}: no column ${column}`);
      }
      const orderBy = mapping.orderByField ?? 'id';
      if (!columns.has(orderBy)) problems.push(`${where}: no order column ${orderBy}`);
    }
    expect(problems).toEqual([]);
  });

  it('should declare exactly the values each Hasura enum table holds', async () => {
    const problems: string[] = [];
    const registered = app.registry.enums.list();
    expect(registered.length).toBeGreaterThan(0);
    for (const declared of registered) {
      const table = ENUM_TABLES[declared.name];
      if (table === undefined) {
        problems.push(`${declared.name}: no Hasura enum table named`);
        continue;
      }
      const values = (declared.values ?? []).map((member) => member.value).sort();
      const enumType = await typeOf(`${table}_enum`);
      const rows = (enumType?.enumValues ?? []).map((value) => value.name).sort();
      if (JSON.stringify(values) !== JSON.stringify(rows)) {
        problems.push(
          `${declared.name}: declares ${values.join(',')}, ${table} holds ${rows.join(',')}`,
        );
      }
    }
    expect(problems).toEqual([]);
  });
});
