import type { Box } from './timeline';

/** A tag drawn onto the footage at a `shot` mark; it points at `target`, or else at the shot's own box. */
export type Callout = { at: string; text: string; target?: Box; side?: 'left' | 'right' };

/** One recorded shot of a scene; its length is the length of its footage. */
export type BeatSpec = { clip: string; callouts: Callout[] };

export type ConsoleScene = {
  id: string;
  kind: 'console';
  chapter: number;
  label: string;
  title: string;
  beats: BeatSpec[];
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

const beat = (clip: string, ...callouts: Callout[]): BeatSpec => ({ clip, callouts });

/** The storyboard (design.md §5), cut as clean beats. Callouts point at the box their `shot` mark recorded. */
export const SCENES: Scene[] = [
  { id: 'title', kind: 'title', seconds: 6 },
  {
    id: 'overview',
    kind: 'console',
    chapter: 1,
    label: 'OVERVIEW',
    title: 'One console for the whole building',
    beats: [
      beat('overview-workspace', { at: 'workspace', text: 'Cameras and events, live' }),
      beat('overview-dashboard', { at: 'dashboard', text: 'Who is on site now' }),
    ],
  },
  {
    id: 'recognition',
    kind: 'console',
    chapter: 2,
    label: 'RECOGNITION',
    title: 'Every camera knows who it sees',
    beats: [
      beat('recognition-camera', { at: 'named-box', text: 'Faces matched live' }),
      beat('recognition-wall', { at: 'wall', text: 'Every camera, live' }),
    ],
  },
  {
    id: 'people',
    kind: 'console',
    chapter: 3,
    label: 'PEOPLE',
    title: "A person's whole day, in one timeline",
    beats: [
      beat('people-faces', { at: 'faces', text: 'Faces seen today' }),
      beat('people-photos', { at: 'photos', text: 'Captures from every camera' }),
      beat('people-timeline', { at: 'timeline', text: 'Arrivals, doors and zones, in order' }),
    ],
  },
  {
    id: 'places',
    kind: 'console',
    chapter: 4,
    label: 'PLACES',
    title: 'Your building, floor by floor',
    beats: [
      beat('places-tree', { at: 'tree', text: 'Live count for every area' }),
      beat('places-lobby', { at: 'lobby', text: 'Occupancy per zone' }),
      beat('places-floor12'),
    ],
  },
  {
    id: 'access',
    kind: 'console',
    chapter: 5,
    label: 'ACCESS',
    title: 'Who gets in, and why',
    beats: [
      beat('access-list'),
      beat('access-trace', { at: 'trace', text: 'The policy that said no' }),
      beat('access-policies', { at: 'policies', text: 'Why doors were denied' }),
    ],
  },
  {
    id: 'incidents',
    kind: 'console',
    chapter: 6,
    label: 'INCIDENTS',
    title: 'Incidents raise themselves',
    beats: [
      beat('incidents-events'),
      beat('incidents-incident', { at: 'incident', text: 'Escalated automatically' }),
      beat('incidents-rule', { at: 'rule-test', text: 'Try an alert before it goes live' }),
    ],
  },
  {
    id: 'analytics',
    kind: 'console',
    chapter: 7,
    label: 'ANALYTICS',
    title: 'See how the building lives',
    beats: [
      beat('analytics-charts'),
      beat('analytics-heatmap', { at: 'heatmap', text: 'Busiest hours' }),
      beat('analytics-flows', { at: 'flows', text: 'Where people go' }),
    ],
  },
  {
    id: 'privacy',
    kind: 'console',
    chapter: 8,
    label: 'PRIVACY',
    title: 'Privacy built in',
    beats: [
      beat('privacy-steps', { at: 'steps', text: 'Erased on request, step by step' }),
      beat('privacy-retention'),
      beat('privacy-status', { at: 'status', text: 'Health at a glance' }),
      beat('privacy-help'),
    ],
  },
  { id: 'outro', kind: 'outro', seconds: 10 },
];
