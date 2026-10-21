import { defineAppDefinition, defineEnum, defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { enumField } from '../../src/enums/field';

/**
 * Every enum-valued field the console registers (resource fields, flow form
 * fields, anywhere in a resource definition) names a registered enum in
 * `ui.enum` and the same one in `meta.enumNamespace`. A field missing `ui.enum`
 * renders an empty select (the invite flow's Role, found by the smoke suite).
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Paths of enum fields under `value` whose `ui.enum` is missing, unregistered or disagrees with `meta`. */
function unboundEnumFields(value: unknown, enums: ReadonlySet<string>, path: string, seen = new Set<unknown>()): string[] {
  if (!isRecord(value) || seen.has(value)) return [];
  seen.add(value);
  const out: string[] = [];
  if (value.kind === 'enum' && Array.isArray(value.values)) {
    // A flow form normalizes `ui.enum` to an entity ref (`{ namespace, id }`).
    const raw = isRecord(value.ui) ? value.ui.enum : undefined;
    const ui = isRecord(raw) ? raw.id : raw;
    const meta = isRecord(value.meta) ? value.meta.enumNamespace : undefined;
    if (typeof ui !== 'string' || !enums.has(ui) || ui !== meta) {
      out.push(`${path} (ui.enum ${String(ui)}, meta.enumNamespace ${String(meta)})`);
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'schema' || key === 'opts') continue;
    out.push(...unboundEnumFields(child, enums, `${path}.${key}`, seen));
  }
  return out;
}

async function findings(runtime: typeof app): Promise<string[]> {
  await runtime.ready;
  const enums = new Set(runtime.registry.enums.list().map((e) => e.name));
  return runtime.registry.list().flatMap((resource) => unboundEnumFields(resource, enums, resource.name));
}

describe('enum fields of the console', () => {
  it('should bind every registered enum field to its enum in ui.enum', async () => {
    expect(await findings(app)).toEqual([]);
  });
});

describe('the enum field check', () => {
  const colourEnum = defineEnum({ name: 'probe_colour', values: [{ value: 'red' }, { value: 'blue' }] });

  it('should find a bare f.enum in a resource field and in a flow form, and pass enumField', async () => {
    const probe = defineResource('enum_probe', {
      fields: {
        bare: f.enum(['red', 'blue'] as const, { meta: { enumNamespace: 'probe_colour' } }),
        bound: enumField(['red', 'blue'] as const, 'probe_colour'),
      },
      actions: (r) => ({
        resource: [
          r.action.flow('paint', {
            form: { fields: { colour: f.enum(['red', 'blue'] as const) } },
            submit: { update: 'enum_probe', input: {} },
          }),
        ],
      }),
    });
    const runtime = defineAppDefinition({ name: 'enum-probe' }, ({ use }) => {
      use('enum-probe', colourEnum, probe);
    }).createRuntime();
    const found = await findings(runtime);
    expect(found).toHaveLength(2);
    expect(found.some((path) => /^enum_probe\.actions\..*form\.fields/.test(path))).toBe(true);
    expect(found.some((path) => path.startsWith('enum_probe.fields.bare '))).toBe(true);
  });
});
