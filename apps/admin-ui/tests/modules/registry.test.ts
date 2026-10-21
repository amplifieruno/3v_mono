import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasuraTable } from '../../src/data/mapping';
import { hasuraOperation } from '../../src/data/operations';
import { CONSOLE_MODULES, HASURA_OPERATIONS, ITAP_TABLES } from '../../src/modules';
import { type ConsoleModule, collectOperations, collectTables } from '../../src/modules/module';

/**
 * The central registries are folds over the module objects
 * (`src/modules/index.ts`): every module contributes its tables and operation
 * documents once, a duplicate fails at load, and no module reaches back into
 * a registry (which would be an import cycle).
 */

const SRC = join(import.meta.dirname, '../../src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}

const query = (resource: string, operation: string) =>
  hasuraOperation(resource, operation, { kind: 'query', document: 'query Q { x }', variables: () => undefined });

describe('module registries', () => {
  it('should hold exactly the tables and operations the modules declare', () => {
    const tables = CONSOLE_MODULES.flatMap((m) => Object.keys(m.tables ?? {})).sort();
    expect(Object.keys(ITAP_TABLES).sort()).toEqual(tables);
    const operations = CONSOLE_MODULES.flatMap((m) =>
      (m.operations ?? []).map((o) => `${o.binding.resource}.${o.binding.operation}`),
    ).sort();
    const registered = Object.entries(HASURA_OPERATIONS)
      .flatMap(([resource, byName]) => Object.keys(byName).map((name) => `${resource}.${name}`))
      .sort();
    expect(registered).toEqual(operations);
    expect(operations).toEqual(['organization_invitation.inviteMember', 'overview.dashboardKpis', 'storage_files.openFile']);
  });

  it('should give every module a distinct contribution id', () => {
    const names = CONSOLE_MODULES.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should refuse a table or an operation declared by two modules', () => {
    const a: ConsoleModule = { name: 'a', uses: [], tables: { area: hasuraTable('areas') }, operations: [query('x', 'q')] };
    const b: ConsoleModule = { name: 'b', uses: [], tables: { area: hasuraTable('areas') } };
    const c: ConsoleModule = { name: 'c', uses: [], operations: [query('x', 'q')] };
    expect(() => collectTables([a, b])).toThrow("Duplicate Hasura mapping 'area'.");
    expect(() => collectOperations([a, c])).toThrow("Duplicate operation x 'q'.");
    expect(collectOperations([a, { ...c, operations: [query('x', 'r')] }]).x).toHaveProperty('r');
  });

  it('should keep modules and fields from importing the registries or the definition', () => {
    const offenders = [...sourceFiles(join(SRC, 'modules')), ...sourceFiles(join(SRC, 'fields'))]
      .filter((file) => !file.endsWith(join('modules', 'index.ts')))
      .filter((file) =>
        /from '(?:(?:\.\.\/)+(?:modules|modules\/index|app\/app-definition|data\/provider)|\.\.|\.\.\/index)'/u.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
