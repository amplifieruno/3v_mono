import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { FunctionSpec, TableSpec } from '../metadata-src/types.js';
import { planFunctionMetadata, rewriteFunctionsYaml, type FunctionRow } from './build-function-metadata.js';

const tables: TableSpec[] = [
  { name: 'face_matches', schema: 'itap_results', profile: 'tenant_read' },
  { name: 'invitations', profile: 'none' },
  {
    name: 'rows_for_user',
    schema: 'itap_results',
    profile: 'none',
    extraPermissions: { select_permissions: [{ role: 'user', permission: { columns: ['id'], filter: {} } }] },
  },
];

const matchRow: FunctionRow = {
  schema: 'itap',
  name: 'match_face',
  volatility: 's',
  argNames: ['hasura_session', 'p_embedding'],
  argTypes: ['json', 'text'],
  returnsSet: true,
  returnSchema: 'itap_results',
  returnTable: 'face_matches',
};
const acceptRow: FunctionRow = {
  schema: 'itap',
  name: 'accept_invitation',
  volatility: 'v',
  argNames: ['p_token_hash'],
  argTypes: ['text'],
  returnsSet: true,
  returnSchema: 'itap',
  returnTable: 'invitations',
};

const match: FunctionSpec = { name: 'match_face', exposedAs: 'query', sessionArgument: 'hasura_session', roles: ['org_admin'] };
const accept: FunctionSpec = { name: 'accept_invitation', customName: 'claim_invitation', exposedAs: 'mutation', roles: [] };

describe('planFunctionMetadata', () => {
  it('should emit one file per function with configuration and explicit permissions', () => {
    const files = planFunctionMetadata([match, accept], tables, [matchRow, acceptRow]);
    expect([...files.keys()]).toEqual(['itap_accept_invitation.yaml', 'itap_match_face.yaml']);
    expect(parse(files.get('itap_match_face.yaml') ?? '')).toEqual({
      function: { schema: 'itap', name: 'match_face' },
      configuration: { custom_name: 'match_face', exposed_as: 'query', session_argument: 'hasura_session' },
      permissions: [{ role: 'org_admin' }],
    });
    expect(parse(files.get('itap_accept_invitation.yaml') ?? '')).toEqual({
      function: { schema: 'itap', name: 'accept_invitation' },
      configuration: { custom_name: 'claim_invitation', exposed_as: 'mutation' },
    });
  });

  it('should accept a role granted select through extraPermissions', () => {
    const row: FunctionRow = { ...matchRow, name: 'mine', returnTable: 'rows_for_user' };
    const files = planFunctionMetadata([{ name: 'mine', exposedAs: 'query', roles: ['user'] }], tables, [row]);
    expect(parse(files.get('itap_mine.yaml') ?? '').permissions).toEqual([{ role: 'user' }]);
  });

  it('should throw when the function does not exist or is overloaded', () => {
    expect(() => planFunctionMetadata([match], tables, [])).toThrow(/itap\.match_face.*not found/);
    expect(() => planFunctionMetadata([match], tables, [matchRow, matchRow])).toThrow(/overloaded/);
  });

  it('should throw when the session argument is missing or not json', () => {
    expect(() => planFunctionMetadata([match], tables, [{ ...matchRow, argNames: ['p_embedding'], argTypes: ['text'] }])).toThrow(
      /session argument "hasura_session"/,
    );
    expect(() => planFunctionMetadata([match], tables, [{ ...matchRow, argTypes: ['jsonb', 'text'] }])).toThrow(/must be json/);
  });

  it('should throw when a volatile function is exposed as a query', () => {
    expect(() => planFunctionMetadata([match], tables, [{ ...matchRow, volatility: 'v' }])).toThrow(/volatile.*mutation/);
  });

  it('should throw when the return type is not a specced table', () => {
    expect(() => planFunctionMetadata([match], tables, [{ ...matchRow, returnSchema: null, returnTable: null }])).toThrow(
      /must return a table/,
    );
    expect(() => planFunctionMetadata([match], tables, [{ ...matchRow, returnTable: 'unknown' }])).toThrow(/no spec/);
  });

  it('should throw when a role cannot select the return table', () => {
    expect(() => planFunctionMetadata([{ ...match, roles: ['user'] }], tables, [matchRow])).toThrow(
      /role "user" has no select permission on itap_results\.face_matches/,
    );
  });

  it('should throw on duplicate root field names', () => {
    expect(() =>
      planFunctionMetadata([match, { ...accept, customName: 'match_face' }], tables, [matchRow, acceptRow]),
    ).toThrow(/duplicate.*match_face/i);
  });
});

describe('rewriteFunctionsYaml', () => {
  it('should keep hand-written includes and append generated ones sorted', () => {
    const out = rewriteFunctionsYaml('- "!include public_custom.yaml"\n- "!include itap_old.yaml"\n', ['itap_b.yaml', 'itap_a.yaml']);
    expect(out).toBe('- "!include public_custom.yaml"\n- "!include itap_a.yaml"\n- "!include itap_b.yaml"\n');
  });

  it('should write [] when nothing is listed', () => {
    expect(rewriteFunctionsYaml('[]\n', [])).toBe('[]\n');
  });

  it('should throw on inline entries that would be lost', () => {
    expect(() => rewriteFunctionsYaml('- function:\n    schema: itap\n    name: x\n', [])).toThrow(/inline/);
  });
});
