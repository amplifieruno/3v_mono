import { testEnv } from './clients.js';

/** Runs SQL through Hasura `run_sql` (admin secret); throws with the Hasura error body on failure. */
export async function runSql(sql: string): Promise<void> {
  const env = testEnv();
  const res = await fetch(new URL('/v2/query', env.HASURA_GRAPHQL_URL).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': env.GRAPHQL_ADMIN_SECRET },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql } }),
  });
  if (!res.ok) throw new Error(`run_sql failed: ${await res.text()}`);
}
