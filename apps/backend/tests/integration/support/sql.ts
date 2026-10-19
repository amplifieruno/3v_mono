import { testEnv } from './clients.js';

/** Runs SQL through Hasura `run_sql` (admin secret); throws with the Hasura error body on failure. */
export async function runSql(sql: string): Promise<void> {
  await runSqlRows(sql);
}

/**
 * Like `runSql`, but returns the rows of the last statement as strings (null stays null) keyed by column name.
 * Statements without a result set return `[]`.
 */
export async function runSqlRows(sql: string): Promise<Record<string, string | null>[]> {
  const env = testEnv();
  const res = await fetch(new URL('/v2/query', env.HASURA_GRAPHQL_URL).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': env.GRAPHQL_ADMIN_SECRET },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql } }),
  });
  if (!res.ok) throw new Error(`run_sql failed: ${await res.text()}`);
  const body = (await res.json()) as { result_type: string; result?: (string | null)[][] };
  if (body.result_type !== 'TuplesOk' || !body.result) return [];
  const [header, ...rows] = body.result;
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name ?? '', row[i] ?? null])));
}
