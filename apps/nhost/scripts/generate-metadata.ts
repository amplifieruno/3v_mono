/**
 * Generates Hasura table metadata for schemas `itap` / `itap_results` from metadata-src specs
 * and live DB introspection (Hasura run_sql, admin secret).
 *
 * Env: HASURA_ENDPOINT (default http://localhost:8080), GRAPHQL_ADMIN_SECRET (read from root .env.dev if unset).
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tables } from '../metadata-src/index.js';
import { introspect } from './introspect.js';
import { isGeneratedFile, planMetadata, rewriteTablesYaml } from './plan-metadata.js';

const here = dirname(fileURLToPath(import.meta.url));
const TABLES_DIR = resolve(here, '../nhost/metadata/databases/default/tables');
const ROOT_ENV = resolve(here, '../../../.env.dev');

async function main(): Promise<void> {
  if (!process.env.GRAPHQL_ADMIN_SECRET && existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const adminSecret = process.env.GRAPHQL_ADMIN_SECRET;
  if (!adminSecret) throw new Error('GRAPHQL_ADMIN_SECRET is not set (and not found in .env.dev)');
  const endpoint = process.env.HASURA_ENDPOINT ?? 'http://localhost:8080';

  const intro = await introspect({ endpoint, adminSecret });
  const files = planMetadata(tables, intro);

  const existing = (await readdir(TABLES_DIR)).filter(isGeneratedFile);
  const stale = existing.filter((f) => !files.has(f));
  for (const file of stale) await unlink(join(TABLES_DIR, file));

  let written = 0;
  for (const [file, content] of files) {
    const path = join(TABLES_DIR, file);
    const previous = existsSync(path) ? await readFile(path, 'utf8') : undefined;
    if (previous !== content) {
      await writeFile(path, content);
      written += 1;
    }
  }

  const tablesYamlPath = join(TABLES_DIR, 'tables.yaml');
  const tablesYaml = rewriteTablesYaml(await readFile(tablesYamlPath, 'utf8'), [...files.keys()]);
  await writeFile(tablesYamlPath, tablesYaml);

  process.stdout.write(
    `metadata: ${files.size} table(s), ${written} file(s) written, ${stale.length} stale file(s) removed\n`,
  );
}

main().catch((err: unknown) => {
  process.stderr.write(`metadata:generate failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
