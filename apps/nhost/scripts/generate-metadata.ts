/**
 * Generates Hasura table and tracked-function metadata for schemas `itap` / `itap_results` from metadata-src specs
 * and live DB introspection (Hasura run_sql, admin secret).
 *
 * Env: HASURA_ENDPOINT (default http://localhost:8080), GRAPHQL_ADMIN_SECRET (read from root .env.dev if unset).
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { functions, tables } from '../metadata-src/index.js';
import { isGeneratedFunctionFile, planFunctionMetadata, rewriteFunctionsYaml } from './build-function-metadata.js';
import { introspect, introspectFunctions } from './introspect.js';
import { isGeneratedFile, planMetadata, rewriteTablesYaml } from './plan-metadata.js';

const here = dirname(fileURLToPath(import.meta.url));
const TABLES_DIR = resolve(here, '../nhost/metadata/databases/default/tables');
const FUNCTIONS_DIR = resolve(here, '../nhost/metadata/databases/default/functions');
const ROOT_ENV = resolve(here, '../../../.env.dev');

async function main(): Promise<void> {
  if (!process.env.GRAPHQL_ADMIN_SECRET && existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
  const adminSecret = process.env.GRAPHQL_ADMIN_SECRET;
  if (!adminSecret) throw new Error('GRAPHQL_ADMIN_SECRET is not set (and not found in .env.dev)');
  const endpoint = process.env.HASURA_ENDPOINT ?? 'http://localhost:8080';

  const admin = { endpoint, adminSecret };
  const [intro, functionRows] = await Promise.all([introspect(admin), introspectFunctions(admin)]);
  const tableFiles = planMetadata(tables, intro);
  const functionFiles = planFunctionMetadata(functions, tables, functionRows);

  const t = await syncDir(TABLES_DIR, tableFiles, isGeneratedFile);
  const tablesYamlPath = join(TABLES_DIR, 'tables.yaml');
  await writeFile(tablesYamlPath, rewriteTablesYaml(await readFile(tablesYamlPath, 'utf8'), [...tableFiles.keys()]));

  const f = await syncDir(FUNCTIONS_DIR, functionFiles, isGeneratedFunctionFile);
  const functionsYamlPath = join(FUNCTIONS_DIR, 'functions.yaml');
  await writeFile(
    functionsYamlPath,
    rewriteFunctionsYaml(await readFile(functionsYamlPath, 'utf8'), [...functionFiles.keys()]),
  );

  process.stdout.write(
    `metadata: ${tableFiles.size} table(s), ${functionFiles.size} function(s), ${t.written + f.written} file(s) ` +
      `written, ${t.stale + f.stale} stale file(s) removed\n`,
  );
}

/** Writes changed files, removes generated files no longer planned. */
async function syncDir(
  dir: string,
  files: Map<string, string>,
  isGenerated: (fileName: string) => boolean,
): Promise<{ written: number; stale: number }> {
  const stale = (await readdir(dir)).filter((f) => isGenerated(f) && !files.has(f));
  for (const file of stale) await unlink(join(dir, file));
  let written = 0;
  for (const [file, content] of files) {
    const path = join(dir, file);
    const previous = existsSync(path) ? await readFile(path, 'utf8') : undefined;
    if (previous !== content) {
      await writeFile(path, content);
      written += 1;
    }
  }
  return { written, stale: stale.length };
}

main().catch((err: unknown) => {
  process.stderr.write(`metadata:generate failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
