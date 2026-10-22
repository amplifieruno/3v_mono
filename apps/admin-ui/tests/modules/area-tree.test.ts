import { describe, expect, it } from 'vitest';
import {
  type AreaTreeRow,
  branchIds,
  buildAreaTree,
  isInsideArea,
  visibleNodes,
} from '../../src/modules/places/area-tree';

const row = (id: string, parent: string | null, name: string): AreaTreeRow => ({
  id,
  parent_id: parent,
  name,
  area_type: 'zone',
  capacity: null,
  current_occupancy: 0,
});

/** Nova Tower: a building with two floors (floor 10 sorts after floor 2) and rooms. */
const ROWS: readonly AreaTreeRow[] = [
  row('room-b', 'floor-2', 'Room B'),
  row('tower', null, 'Nova Tower'),
  row('floor-10', 'tower', 'Floor 10'),
  row('room-a', 'floor-2', 'Room A'),
  row('floor-2', 'tower', 'Floor 2'),
  row('garage', null, 'Garage'),
];

const names = (nodes: ReturnType<typeof visibleNodes>): string[] =>
  nodes.map((node) => `${'-'.repeat(node.level)}${node.area.name}`);

describe('buildAreaTree', () => {
  it('should nest each area under its parent, siblings in natural name order', () => {
    const tree = buildAreaTree(ROWS);
    expect(names(visibleNodes(tree, new Set()))).toEqual([
      'Garage',
      'Nova Tower',
      '-Floor 2',
      '--Room A',
      '--Room B',
      '-Floor 10',
    ]);
  });

  it('should keep an area whose parent was not read as a root', () => {
    const tree = buildAreaTree([row('room-a', 'floor-2', 'Room A'), row('tower', null, 'Tower')]);
    expect(names(visibleNodes(tree, new Set()))).toEqual(['Room A', 'Tower']);
  });

  it('should leave out rows of a parent loop instead of recursing forever', () => {
    const tree = buildAreaTree([row('a', 'b', 'A'), row('b', 'a', 'B'), row('c', null, 'C')]);
    expect(names(visibleNodes(tree, new Set()))).toEqual(['C']);
  });

  it('should hide the sub-areas of a collapsed area and list every branch', () => {
    const tree = buildAreaTree(ROWS);
    expect(branchIds(tree).sort()).toEqual(['floor-2', 'tower']);
    expect(names(visibleNodes(tree, new Set(['floor-2'])))).toEqual([
      'Garage',
      'Nova Tower',
      '-Floor 2',
      '-Floor 10',
    ]);
    expect(names(visibleNodes(tree, new Set(['tower'])))).toEqual(['Garage', 'Nova Tower']);
  });
});

describe('isInsideArea', () => {
  it('should find the area itself and its descendants by path', () => {
    expect(isInsideArea(['tower', 'floor-2', 'room-a'], 'floor-2')).toBe(true);
    expect(isInsideArea(['tower', 'floor-2'], 'floor-2')).toBe(true);
    expect(isInsideArea(['tower', 'floor-10'], 'floor-2')).toBe(false);
    expect(isInsideArea(null, 'floor-2')).toBe(false);
  });
});
