import type { Box } from './timeline';

/** A tag drawn onto the footage at a `shot` mark; it points at `target`, or else at the shot's own box. */
export type Callout = { at: string; text: string; target?: Box; side?: 'left' | 'right' };

export type ConsoleScene = {
  id: string;
  kind: 'console';
  chapter: number;
  label: string;
  title: string;
  clip: string;
  seconds: number;
  callouts: Callout[];
};

export type Scene =
  | { id: 'title'; kind: 'title'; seconds: number }
  | { id: 'outro'; kind: 'outro'; seconds: number }
  | ConsoleScene;

export const FPS = 30;

/** On-screen copy of the title and outro cards (design.md §4). */
export const TITLE_TEXT = {
  word: 'ITAP',
  tagline: 'identity · tracking · access',
  corners: ['ITAP · OCT 2026', 'NOVA TOWER'],
};
export const OUTRO_TEXT = {
  headline: 'One platform for identity, access and safety',
  tags: [
    'Live recognition',
    'People',
    'Places & floor plans',
    'Devices',
    'Access control',
    'Face sign-in',
    'Incidents',
    'Notifications',
    'Segments',
    'Face search',
    'Analytics',
    'Privacy & compliance',
  ],
};

/** The storyboard (design.md §5). Callouts point at the box their `shot` mark recorded. */
export const SCENES: Scene[] = [
  { id: 'title', kind: 'title', seconds: 6 },
  {
    id: 'overview',
    kind: 'console',
    chapter: 1,
    label: 'OVERVIEW',
    title: 'One console for the whole building',
    clip: 'overview',
    seconds: 14,
    callouts: [
      {
        at: 'workspace',
        text: 'Cameras and events, live',
        target: { x: 310, y: 222, w: 490, h: 275 },
      },
      { at: 'dashboard', text: 'Who is on site now' },
    ],
  },
  {
    id: 'recognition',
    kind: 'console',
    chapter: 2,
    label: 'RECOGNITION',
    title: 'Every camera knows who it sees',
    clip: 'recognition',
    seconds: 20,
    callouts: [
      { at: 'named-box', text: 'Known person', side: 'right' },
      { at: 'wall', text: 'Every camera, live' },
    ],
  },
  {
    id: 'people',
    kind: 'console',
    chapter: 3,
    label: 'PEOPLE',
    title: "A person's whole day, in one timeline",
    clip: 'people',
    seconds: 18,
    callouts: [
      { at: 'faces', text: 'Faces seen today' },
      { at: 'photos', text: 'Captures from every camera' },
      { at: 'timeline', text: 'Arrivals, doors and zones, in order' },
    ],
  },
  {
    id: 'places',
    kind: 'console',
    chapter: 4,
    label: 'PLACES',
    title: 'Your building, floor by floor',
    clip: 'places',
    seconds: 16,
    callouts: [
      { at: 'tree', text: 'Live count for every area' },
      { at: 'lobby', text: 'Occupancy per zone' },
    ],
  },
  {
    id: 'access',
    kind: 'console',
    chapter: 5,
    label: 'ACCESS',
    title: 'Who gets in, and why',
    clip: 'access',
    seconds: 15,
    callouts: [
      { at: 'trace', text: 'The policy that said no' },
      { at: 'policies', text: 'Why doors were denied' },
    ],
  },
  {
    id: 'incidents',
    kind: 'console',
    chapter: 6,
    label: 'INCIDENTS',
    title: 'Incidents raise themselves',
    clip: 'incidents',
    seconds: 18,
    callouts: [
      { at: 'incident', text: 'Escalated automatically' },
      { at: 'rule-test', text: 'Try an alert before it goes live' },
    ],
  },
  {
    id: 'analytics',
    kind: 'console',
    chapter: 7,
    label: 'ANALYTICS',
    title: 'See how the building lives',
    clip: 'analytics',
    seconds: 16,
    callouts: [
      { at: 'heatmap', text: 'Busiest hours' },
      { at: 'flows', text: 'Where people go' },
    ],
  },
  {
    id: 'privacy',
    kind: 'console',
    chapter: 8,
    label: 'PRIVACY',
    title: 'Privacy built in',
    clip: 'privacy',
    seconds: 16,
    callouts: [
      { at: 'steps', text: 'Erased on request, step by step' },
      { at: 'status', text: 'Health at a glance' },
    ],
  },
  { id: 'outro', kind: 'outro', seconds: 10 },
];

export function totalSeconds(scenes: Scene[]): number {
  return scenes.reduce((sum, s) => sum + s.seconds, 0);
}
