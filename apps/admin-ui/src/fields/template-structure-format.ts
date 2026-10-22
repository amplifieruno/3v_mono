/**
 * The area tree of a facility template (`facility_templates.structure`), as
 * `itap.valid_template_structure` accepts it: a non-empty array of nodes
 * `{ name, area_type, access_level?, capacity?, children? }`, children again nodes, no other
 * keys, at most 6 levels and 200 nodes, a non-blank name of at most 200 characters, existing
 * area type and access level values, a whole capacity of at least 0.
 */
import { AREA_ACCESS_LEVELS, AREA_TYPES } from '../enums/places';
import type { FieldProblem } from './field-issue';

export const TEMPLATE_MAX_DEPTH = 6;
export const TEMPLATE_MAX_NODES = 200;
const NAME_MAX = 200;
const CAPACITY_MAX = 2147483647;
const NODE_KEYS = ['name', 'area_type', 'access_level', 'capacity', 'children'];

export interface TemplateNode {
  readonly name: string;
  readonly area_type: string;
  readonly access_level: string | null;
  readonly capacity: number | null;
  readonly children: readonly TemplateNode[];
}

type Raw = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIn = (list: readonly string[], value: unknown): boolean =>
  typeof value === 'string' && list.includes(value);

/** One node's problem, `node` its position as `2.1` (the first child of the second root). */
function nodeProblem(raw: unknown, node: string): FieldProblem | null {
  const at = { node };
  if (!isObject(raw)) {
    return { code: 'templateStructure.notNode', text: `Area ${node} is not an object.`, params: at };
  }
  const extra = Object.keys(raw).filter((key) => !NODE_KEYS.includes(key));
  if (extra.length > 0) {
    const keys = extra.join(', ');
    return {
      code: 'templateStructure.unexpectedKeys',
      text: `Area ${node} has unexpected keys (${keys}); use name, area_type, access_level, capacity and children.`,
      params: { node, keys },
    };
  }
  if (typeof raw.name !== 'string' || raw.name.trim() === '') {
    return { code: 'templateStructure.noName', text: `Area ${node} needs a name.`, params: at };
  }
  if (raw.name.length > NAME_MAX) {
    return {
      code: 'templateStructure.longName',
      text: `Area ${node}: the name is longer than ${NAME_MAX} characters.`,
      params: { node, max: NAME_MAX },
    };
  }
  if (!isIn(AREA_TYPES, raw.area_type)) {
    const types = AREA_TYPES.join(', ');
    return {
      code: 'templateStructure.badType',
      text: `Area ${node}: area_type must be one of ${types}.`,
      params: { node, types },
    };
  }
  if ('access_level' in raw && !isIn(AREA_ACCESS_LEVELS, raw.access_level)) {
    const levels = AREA_ACCESS_LEVELS.join(', ');
    return {
      code: 'templateStructure.badAccessLevel',
      text: `Area ${node}: access_level must be one of ${levels}.`,
      params: { node, levels },
    };
  }
  const capacity = raw.capacity;
  if (
    'capacity' in raw &&
    (typeof capacity !== 'number' ||
      !Number.isInteger(capacity) ||
      capacity < 0 ||
      capacity > CAPACITY_MAX)
  ) {
    return {
      code: 'templateStructure.badCapacity',
      text: `Area ${node}: capacity must be a whole number of at least 0.`,
      params: at,
    };
  }
  return null;
}

/**
 * `null` when `value` is a structure the database accepts (or nothing), else the first
 * problem (code `templateStructure.<reason>`).
 */
export function validateTemplateStructure(value: unknown): FieldProblem | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) {
    return {
      code: 'templateStructure.notList',
      text: 'The structure must be a list of areas, such as [{"name": "Lobby", "area_type": "zone"}].',
    };
  }
  if (value.length === 0) {
    return { code: 'templateStructure.empty', text: 'Add at least one area to the structure.' };
  }
  let count = 0;
  const walk = (nodes: readonly unknown[], prefix: string, level: number): FieldProblem | null => {
    if (level > TEMPLATE_MAX_DEPTH) {
      return {
        code: 'templateStructure.tooDeep',
        text: `The structure is deeper than ${TEMPLATE_MAX_DEPTH} levels.`,
        params: { max: TEMPLATE_MAX_DEPTH },
      };
    }
    for (const [index, raw] of nodes.entries()) {
      const node = `${prefix}${index + 1}`;
      const problem = nodeProblem(raw, node);
      if (problem !== null) return problem;
      count += 1;
      if (count > TEMPLATE_MAX_NODES) {
        return {
          code: 'templateStructure.tooMany',
          text: `The structure has more than ${TEMPLATE_MAX_NODES} areas.`,
          params: { max: TEMPLATE_MAX_NODES },
        };
      }
      const children = (raw as Raw).children;
      if (children === undefined) continue;
      if (!Array.isArray(children)) {
        return {
          code: 'templateStructure.childrenNotList',
          text: `Area ${node}: children must be a list of areas.`,
          params: { node },
        };
      }
      const nested = walk(children, `${node}.`, level + 1);
      if (nested !== null) return nested;
    }
    return null;
  };
  return walk(value, '', 1);
}

/** The nodes of a stored structure for display; what does not read as a node is left out. */
export function templateNodesOf(value: unknown): TemplateNode[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): TemplateNode[] => {
    if (!isObject(raw) || typeof raw.name !== 'string') return [];
    return [
      {
        name: raw.name,
        area_type: typeof raw.area_type === 'string' ? raw.area_type : '',
        access_level: typeof raw.access_level === 'string' ? raw.access_level : null,
        capacity: typeof raw.capacity === 'number' ? raw.capacity : null,
        children: templateNodesOf(raw.children),
      },
    ];
  });
}

/** How many areas applying `nodes` creates (every node, at any depth). */
export function countTemplateNodes(nodes: readonly TemplateNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countTemplateNodes(node.children), 0);
}
