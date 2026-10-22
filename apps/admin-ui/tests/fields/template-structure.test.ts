import { describe, expect, it } from 'vitest';
import { problemIssue } from '../../src/fields/field-issue';
import { checkTemplateStructure } from '../../src/fields/template-structure';
import {
  countTemplateNodes,
  templateNodesOf,
  validateTemplateStructure,
} from '../../src/fields/template-structure-format';
import { expectTranslated, validatorResult } from '../support/field-issues';

/**
 * A facility template's structure is checked as `itap.valid_template_structure` checks it
 * (non-empty list of nodes, known keys, non-blank names, known area types and access levels,
 * whole capacities, at most 6 levels and 200 nodes), each refusal a translatable issue naming
 * the node by its position.
 */

const node = (name: string, more: Record<string, unknown> = {}) => ({
  name,
  area_type: 'zone',
  ...more,
});

const nested = (depth: number): Record<string, unknown> =>
  depth === 1 ? node(`L${depth}`) : node(`L${depth}`, { children: [nested(depth - 1)] });

describe('template structure validation', () => {
  it('should refuse what the database refuses, naming the node', async () => {
    const refused: readonly [unknown, string][] = [
      [{ name: 'x' }, 'The structure must be a list of areas, such as [{"name": "Lobby", "area_type": "zone"}].'],
      [[], 'Add at least one area to the structure.'],
      [[node('A'), 'B'], 'Area 2 is not an object.'],
      [
        [node('A', { kind: 'x' })],
        'Area 1 has unexpected keys (kind); use name, area_type, access_level, capacity and children.',
      ],
      [[node('A', { children: [node(' ')] })], 'Area 1.1 needs a name.'],
      [[node('x'.repeat(201))], 'Area 1: the name is longer than 200 characters.'],
      [
        [node('A', { area_type: 'hall' })],
        'Area 1: area_type must be one of building, floor, zone, room, sector, entrance, corridor, parking, virtual_zone.',
      ],
      [
        [node('A', { access_level: 'top' })],
        'Area 1: access_level must be one of public, restricted, secure, classified.',
      ],
      [[node('A', { capacity: 2.5 })], 'Area 1: capacity must be a whole number of at least 0.'],
      [[node('A', { capacity: -1 })], 'Area 1: capacity must be a whole number of at least 0.'],
      [[node('A', { children: {} })], 'Area 1: children must be a list of areas.'],
      [[nested(7)], 'The structure is deeper than 6 levels.'],
      [Array.from({ length: 201 }, (_, i) => node(`A${i}`)), 'The structure has more than 200 areas.'],
    ];
    const validate = checkTemplateStructure();
    for (const [value, text] of refused) {
      const problem = validateTemplateStructure(value);
      expect(problem?.text, JSON.stringify(value).slice(0, 80)).toBe(text);
      if (problem === null) continue;
      expect(await validatorResult(validate, value)).toEqual(problemIssue(problem));
      await expectTranslated(problem);
    }
  });

  it('should accept a valid tree, 6 levels deep, with a capacity written as 40.0', async () => {
    const validate = checkTemplateStructure();
    const tree = [
      node('Lobby', { capacity: 40.0, access_level: 'public' }),
      node('Office', { children: [node('Booths', { area_type: 'room', capacity: 0 })] }),
      nested(6),
    ];
    expect(validateTemplateStructure(tree)).toBeNull();
    expect(await validatorResult(validate, tree)).toBeNull();
    expect(countTemplateNodes(templateNodesOf(tree))).toBe(9);
  });

  it('should read stored nodes for display, leaving out what is not a node', () => {
    expect(
      templateNodesOf([node('A', { capacity: 3, children: [node('B'), 7] }), 'junk']),
    ).toEqual([
      {
        name: 'A',
        area_type: 'zone',
        access_level: null,
        capacity: 3,
        children: [{ name: 'B', area_type: 'zone', access_level: null, capacity: null, children: [] }],
      },
    ]);
    expect(templateNodesOf(null)).toEqual([]);
  });
});
